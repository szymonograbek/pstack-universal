#!/usr/bin/env node
// Keeps an explicitly invoked Poteto Mode active for the rest of its session, across compaction and resume.
// Cursor keeps an invoked skill in effect on its own. Claude Code and Codex need this hook.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const harnesses = {
  "claude-code": {
    invocation: /^\s*\/(?:pstack:)?poteto-mode(?![\p{L}\p{N}_:-])/u,
    disable: /^\s*disable \/(?:pstack:)?poteto-mode[.!]?\s*$/iu,
    command: "/poteto-mode",
  },
  codex: {
    invocation: /(?:^|[^\p{L}\p{N}_$])\$(?:pstack:)?poteto-mode(?![\p{L}\p{N}_:-])/u,
    linked: /\[\$(?:pstack:)?poteto-mode\]\(([^)\n]+)\)/gu,
    disable: /^\s*disable \$(?:pstack:)?poteto-mode[.!]?\s*$/iu,
    command: "$poteto-mode",
  },
};

// Codex exports PLUGIN_ROOT and also the CLAUDE_PLUGIN_* aliases. Claude Code exports only CLAUDE_PLUGIN_*.
export const detectHarness = env => (env.PLUGIN_ROOT ? "codex" : "claude-code");

function activates(prompt, harness, root) {
  const rules = harnesses[harness];
  if (harness === "claude-code") return rules.invocation.test(prompt);
  const prose = prompt.replace(/(`+)[\s\S]*?\1/gu, " ").replace(/`[\s\S]*$/u, " ");
  const skillPath = path.join(root, "skills/poteto-mode/SKILL.md");
  if ([...prose.matchAll(rules.linked)].some(match => match[1] === skillPath)) return true;
  return rules.invocation.test(prose.replace(rules.linked, " "));
}

export async function handleHook(input, { harness, dataDirectory, root = pluginRoot }) {
  if (!input || typeof input.session_id !== "string" || !input.session_id ||
      typeof input.cwd !== "string" || !path.isAbsolute(input.cwd) ||
      typeof dataDirectory !== "string" || !path.isAbsolute(dataDirectory)) return null;

  const event = input.hook_event_name;
  if (!["UserPromptSubmit", "SessionStart"].includes(event)) return null;
  if (event === "SessionStart" && !["resume", "compact"].includes(input.source)) return null;
  const key = createHash("sha256").update(JSON.stringify([input.session_id, path.resolve(input.cwd)])).digest("hex");
  const directory = path.join(dataDirectory, "poteto-mode");
  const statePath = path.join(directory, `${key}.json`);
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const { command } = harnesses[harness];

  if (event === "UserPromptSubmit" && harnesses[harness].disable.test(prompt)) {
    await rm(statePath, { force: true });
    return context(event, "Poteto Mode is disabled for this session. Stop applying the mode unless the user enables it again.");
  }

  const activating = event === "UserPromptSubmit" && activates(prompt, harness, root);
  if (activating) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${statePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ version: 1, active: true }), { mode: 0o600, flag: "wx" });
      await rename(temporary, statePath);
    } finally {
      await rm(temporary, { force: true });
    }
  } else {
    let state;
    try {
      state = JSON.parse(await readFile(statePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
      throw error;
    }
    if (state?.version !== 1 || state.active !== true) return null;
  }

  const skill = path.join(root, "skills/poteto-mode/SKILL.md");
  const runtime = path.join(root, "runtime", `${harness}.md`);
  const status = activating
    ? `Poteto Mode activation receipt: the mode stays active for this session, including after compaction. \`disable ${command}\` turns it off.`
    : "Poteto Mode remains active for this session.";
  return context(event, `${status} Read ${skill} and ${runtime}. Apply the user's current request and authority limits.`);
}

function context(event, additionalContext) {
  return { hookSpecificOutput: { hookEventName: event, additionalContext } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let source = "";
    for await (const chunk of process.stdin) source += chunk;
    const output = await handleHook(JSON.parse(source), {
      harness: detectHarness(process.env),
      dataDirectory: process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA,
    });
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      process.stderr.write(`pstack poteto-mode hook failed: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
