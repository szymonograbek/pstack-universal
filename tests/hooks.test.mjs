import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { detectHarness, handleHook } from "../plugins/pstack/hooks/poteto-mode.mjs";

const root = fileURLToPath(new URL("../plugins/pstack/", import.meta.url));
const prompt = (text, session = "one", cwd = "/project") => ({
  hook_event_name: "UserPromptSubmit", session_id: session, cwd, prompt: text,
});

async function fixture(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "pstack-hook-test-"));
  t.after(() => rm(dataDirectory, { recursive: true, force: true }));
  return { dataDirectory, root: path.resolve(root), harness: "codex" };
}

test("codex: activation persists across turns, resume, compaction, and process restarts", async t => {
  const options = await fixture(t);
  const skillPath = path.join(root, "skills/poteto-mode/SKILL.md");
  const runtimePath = path.join(root, "runtime/codex.md");
  const run = input => {
    const result = spawnSync(process.execPath, [path.join(root, "hooks/poteto-mode.mjs")], {
      input: JSON.stringify(input), encoding: "utf8",
      env: { ...process.env, PLUGIN_ROOT: root, PLUGIN_DATA: options.dataDirectory, CLAUDE_PLUGIN_DATA: "/wrong" },
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout ? JSON.parse(result.stdout) : null;
  };
  assert.equal(run(prompt("hello")), null);
  const activation = run(prompt(`Please implement the change. Use [$pstack:poteto-mode](${skillPath}) to implement this.`));
  assert.match(activation.hookSpecificOutput.additionalContext, /activation receipt/);
  assert.match(run(prompt("continue")).hookSpecificOutput.additionalContext, /remains active/);
  for (const source of ["resume", "compact"]) {
    const output = run({ ...prompt(""), hook_event_name: "SessionStart", source });
    assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(output.hookSpecificOutput.additionalContext, /remains active/);
    assert.ok(output.hookSpecificOutput.additionalContext.includes(skillPath));
    assert.ok(output.hookSpecificOutput.additionalContext.includes(runtimePath));
  }
  assert.match(run(prompt("disable $pstack:poteto-mode")).hookSpecificOutput.additionalContext, /disabled/);
  assert.equal(run(prompt("continue")), null);
});

test("codex: bare invocations activate anywhere with aliases and punctuation", async t => {
  const options = await fixture(t);
  const cases = [
    "$poteto-mode fix this",
    "explain $poteto-mode before proceeding",
    "Please fix this with $poteto-mode.",
    "Use ($pstack:poteto-mode), please.",
  ];
  for (const [index, text] of cases.entries()) {
    const output = await handleHook(prompt(text, `bare-${index}`), options);
    assert.match(output.hookSpecificOutput.additionalContext, /activation receipt/);
  }
});

test("codex: state is isolated and examples, suffixes, and foreign links do not activate", async t => {
  const options = await fixture(t);
  const inactive = [
    "`$poteto-mode`",
    "``$poteto-mode``",
    "Example:\n```text\n$pstack:poteto-mode fix this\n```",
    "$poteto-mode-other",
    "$pstack:poteto-mode-extra",
    "[$poteto-mode](/foreign/skills/poteto-mode/SKILL.md)",
  ];
  for (const [index, text] of inactive.entries()) {
    assert.equal(await handleHook(prompt(text, `inactive-${index}`), options), null);
  }
  await handleHook(prompt("$poteto-mode"), options);
  assert.equal(await handleHook(prompt("continue", "two"), options), null);
  assert.equal(await handleHook(prompt("continue", "one", "/other"), options), null);
  assert.equal(await handleHook({ ...prompt(""), hook_event_name: "SubagentStart", agent_type: "default" }, options), null);
  assert.equal(await handleHook({ ...prompt(""), hook_event_name: "Stop" }, options), null);
});

test("codex: linked skill invocation works and partial or corrupt state cannot activate", async t => {
  const options = await fixture(t);
  const link = `[$pstack:poteto-mode](${path.join(root, "skills/poteto-mode/SKILL.md")})`;
  const foreign = "[$poteto-mode](/foreign/skills/poteto-mode/SKILL.md)";
  assert.ok(await handleHook(prompt(`Context first. ${foreign} Use ${link} to implement this.`, "linked"), options));
  const directory = path.join(options.dataDirectory, "poteto-mode");
  const files = await readdir(directory);
  assert.equal(files.length, 1);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, files[0]), "utf8")), { version: 1, active: true });
  await writeFile(path.join(directory, files[0]), "{");
  assert.equal(await handleHook(prompt("continue", "linked"), options), null);
  assert.equal(await handleHook({ ...prompt("$poteto-mode"), session_id: null }, options), null);
  assert.equal(await handleHook(prompt("$poteto-mode"), { harness: "codex" }), null);
});

test("claude code: a leading slash command activates and persists across compaction in a fresh process", async t => {
  const { dataDirectory } = await fixture(t);
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: root, CLAUDE_PLUGIN_DATA: dataDirectory };
  delete env.PLUGIN_ROOT;
  delete env.PLUGIN_DATA;
  const run = input => {
    const result = spawnSync(process.execPath, [path.join(root, "hooks/poteto-mode.mjs")], {
      input: JSON.stringify(input), encoding: "utf8", env,
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout ? JSON.parse(result.stdout) : null;
  };
  assert.equal(run(prompt("hello")), null);
  const activation = run(prompt("/pstack:poteto-mode fix the flaky test"));
  assert.match(activation.hookSpecificOutput.additionalContext, /activation receipt/);
  assert.match(activation.hookSpecificOutput.additionalContext, /`disable \/poteto-mode`/);
  const compacted = run({ ...prompt(""), hook_event_name: "SessionStart", source: "compact" });
  assert.match(compacted.hookSpecificOutput.additionalContext, /remains active/);
  assert.ok(compacted.hookSpecificOutput.additionalContext.includes(path.join(root, "runtime/claude-code.md")));
  assert.equal(run({ ...prompt(""), hook_event_name: "SessionStart", source: "startup" }), null);
  assert.match(run(prompt("disable /pstack:poteto-mode")).hookSpecificOutput.additionalContext, /disabled/);
  assert.equal(run(prompt("continue")), null);
});

test("claude code: only a leading slash command activates", async t => {
  const options = { ...(await fixture(t)), harness: "claude-code" };
  for (const [index, text] of ["/poteto-mode", "  /pstack:poteto-mode\nplan this"].entries()) {
    assert.ok(await handleHook(prompt(text, `on-${index}`), options), text);
  }
  const inactive = ["$poteto-mode fix this", "use /poteto-mode later", "/poteto-mode-other", "/pstack:poteto-modes"];
  for (const [index, text] of inactive.entries()) {
    assert.equal(await handleHook(prompt(text, `off-${index}`), options), null, text);
  }
});

test("harness detection follows PLUGIN_ROOT, which only Codex exports", () => {
  assert.equal(detectHarness({ PLUGIN_ROOT: "/p", CLAUDE_PLUGIN_ROOT: "/p" }), "codex");
  assert.equal(detectHarness({ CLAUDE_PLUGIN_ROOT: "/p" }), "claude-code");
});
