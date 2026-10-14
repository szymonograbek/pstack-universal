// Structural checks for the port. Each one guards a way the port broke during development.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pointer, skillsNeedingPointer } from "./runtime-pointer.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const json = (file) => JSON.parse(readFileSync(path.join(repo, file), "utf8"));
const failures = [];
const check = (ok, message) => ok || failures.push(message);

const plugins = readdirSync(path.join(repo, "plugins"));
const claudeMarket = json(".claude-plugin/marketplace.json")
  .plugins.map((p) => p.source)
  .sort();
const codexMarket = json(".agents/plugins/marketplace.json")
  .plugins.map((p) => p.source.path)
  .sort();
const expected = plugins.map((name) => `./plugins/${name}`).sort();
check(JSON.stringify(claudeMarket) === JSON.stringify(expected), `Claude marketplace lists ${claudeMarket}, expected ${expected}`);
check(JSON.stringify(codexMarket) === JSON.stringify(expected), `Codex marketplace lists ${codexMarket}, expected ${expected}`);

let skillCount = 0;
for (const name of plugins) {
  const plugin = path.join(repo, "plugins", name);
  const claude = json(`plugins/${name}/.claude-plugin/plugin.json`);
  const codex = json(`plugins/${name}/.codex-plugin/plugin.json`);
  check(claude.name === name && codex.name === name, `plugins/${name}: manifest names must equal the directory name`);
  check(claude.version === codex.version, `plugins/${name}: manifest versions differ: ${claude.version} vs ${codex.version}`);

  for (const skillName of readdirSync(path.join(plugin, "skills"))) {
    skillCount++;
    // Codex takes the skill name from frontmatter. Claude Code takes it from the directory.
    const skill = readFileSync(path.join(plugin, "skills", skillName, "SKILL.md"), "utf8");
    check(
      new RegExp(`^---\\nname: ${skillName}\\n`).test(skill),
      `${name}/skills/${skillName}: frontmatter name must equal the directory name`,
    );
  }
  for (const skillName of skillsNeedingPointer(path.join(plugin, "skills"))) {
    const skill = readFileSync(path.join(plugin, "skills", skillName, "SKILL.md"), "utf8");
    check(
      skill.includes(pointer),
      `${name}/skills/${skillName}: names Cursor tools but lacks the runtime pointer (node scripts/runtime-pointer.mjs)`,
    );
  }
  for (const agent of readdirSync(path.join(plugin, "agents"))) {
    // Cursor model aliases such as `fast` make Claude Code's API call fail with model_not_found.
    const model = readFileSync(path.join(plugin, "agents", agent), "utf8").match(/^model: (.*)$/m)?.[1];
    check(
      !model || ["fable", "opus", "sonnet", "haiku", "inherit"].includes(model),
      `${name}/agents/${agent}: model ${model} is not a Claude Code alias`,
    );
  }
  checkFiles(plugin, name);
}

function checkFiles(plugin, name) {
  for (const relative of readdirSync(plugin, { recursive: true })) {
    const file = path.join(plugin, relative);
    if (relative.split(path.sep).includes("node_modules") || !statSync(file).isFile()) continue;
    // Claude Code auto-loads any CLAUDE.md as memory, and macOS matches the name case-insensitively.
    check(path.basename(relative).toLowerCase() !== "claude.md", `${name}/${relative}: Claude Code would load this as memory`);
    if (!relative.endsWith(".md")) continue;
    for (const match of readFileSync(file, "utf8").matchAll(/\]\(([^\s)]+)\)/g)) {
      const link = match[1].split("#")[0];
      if (!link || /^(?:[a-z]+:|\/|<|\{)/i.test(link) || link === "url") continue;
      check(existsSync(path.resolve(path.dirname(file), link)), `${name}/${relative}: broken link ${link}`);
    }
  }
}

const hooks = json("plugins/pstack/hooks/hooks.json");
check(JSON.stringify(Object.keys(hooks.hooks).sort()) === '["SessionStart","UserPromptSubmit"]', "hook events");
for (const entry of Object.values(hooks.hooks)
  .flat()
  .flatMap((e) => e.hooks)) {
  // Codex rewrites ${CLAUDE_PLUGIN_ROOT}, so one hooks.json serves both harnesses.
  check(entry.command.includes("${CLAUDE_PLUGIN_ROOT}"), `hook command must use \${CLAUDE_PLUGIN_ROOT}: ${entry.command}`);
}

try {
  execFileSync(process.execPath, [path.join(repo, "scripts/build.mjs"), "--check"], { stdio: "pipe" });
} catch (error) {
  failures.push(error.stderr.toString().trim());
}

if (failures.length) {
  console.error(failures.map((f) => `- ${f}`).join("\n"));
  process.exit(1);
}
console.log(`Checked ${plugins.length} plugins, ${skillCount} skills, manifests, links, hooks, and generated files.`);
