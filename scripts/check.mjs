// Structural checks for the port. Each one guards a way the port broke during development.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pointer, skillsNeedingPointer } from "./runtime-pointer.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const plugin = path.join(repo, "plugins/pstack");
const json = file => JSON.parse(readFileSync(path.join(repo, file), "utf8"));
const failures = [];
const check = (ok, message) => ok || failures.push(message);

const claude = json("plugins/pstack/.claude-plugin/plugin.json");
const codex = json("plugins/pstack/.codex-plugin/plugin.json");
check(claude.version === codex.version, `manifest versions differ: ${claude.version} vs ${codex.version}`);
check(json(".claude-plugin/marketplace.json").plugins[0].source === "./plugins/pstack", "Claude marketplace source");
check(json(".agents/plugins/marketplace.json").plugins[0].source.path === "./plugins/pstack", "Codex marketplace source");

const skills = readdirSync(path.join(plugin, "skills"));
for (const name of skills) {
  // Codex takes the skill name from frontmatter. Claude Code takes it from the directory.
  const skill = readFileSync(path.join(plugin, "skills", name, "SKILL.md"), "utf8");
  check(new RegExp(`^---\\nname: ${name}\\n`).test(skill), `skills/${name}: frontmatter name must equal the directory name`);
}
for (const name of skillsNeedingPointer(path.join(plugin, "skills"))) {
  const skill = readFileSync(path.join(plugin, "skills", name, "SKILL.md"), "utf8");
  check(skill.includes(pointer), `skills/${name}: names Cursor tools but lacks the runtime pointer (node scripts/runtime-pointer.mjs)`);
}

for (const relative of readdirSync(plugin, { recursive: true })) {
  const file = path.join(plugin, relative);
  if (relative.split(path.sep).includes("node_modules") || !statSync(file).isFile()) continue;
  // Claude Code auto-loads any CLAUDE.md as memory, and macOS matches the name case-insensitively.
  check(path.basename(relative).toLowerCase() !== "claude.md", `${relative}: Claude Code would load this as memory`);
  if (!relative.endsWith(".md")) continue;
  for (const match of readFileSync(file, "utf8").matchAll(/\]\(([^\s)]+)\)/g)) {
    const link = match[1].split("#")[0];
    if (!link || /^(?:[a-z]+:|\/|<|\{)/i.test(link) || link === "url") continue;
    check(existsSync(path.resolve(path.dirname(file), link)), `${relative}: broken link ${link}`);
  }
}

const hooks = json("plugins/pstack/hooks/hooks.json");
check(JSON.stringify(Object.keys(hooks.hooks).sort()) === '["SessionStart","UserPromptSubmit"]', "hook events");
for (const entry of Object.values(hooks.hooks).flat().flatMap(e => e.hooks)) {
  // Codex rewrites ${CLAUDE_PLUGIN_ROOT}, so one hooks.json serves both harnesses.
  check(entry.command.includes("${CLAUDE_PLUGIN_ROOT}"), `hook command must use \${CLAUDE_PLUGIN_ROOT}: ${entry.command}`);
}

try {
  execFileSync(process.execPath, [path.join(repo, "scripts/build-codex.mjs"), "--check"], { stdio: "pipe" });
} catch (error) {
  failures.push(error.stderr.toString().trim());
}

if (failures.length) {
  console.error(failures.map(f => `- ${f}`).join("\n"));
  process.exit(1);
}
console.log(`Checked ${skills.length} skills, manifests, links, hooks, and generated Codex files.`);
