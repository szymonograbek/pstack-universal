// Generates the Codex-only files from upstream sources, so they cannot drift from them.
//   agents/<name>.md                        -> codex/agents/<name>.toml (custom agent registered by setup-pstack)
//   disable-model-invocation in SKILL.md    -> skills/<name>/agents/openai.yaml (Codex ignores the frontmatter key)
//
//   node scripts/build-codex.mjs           write the files
//   node scripts/build-codex.mjs --check   fail when any generated file is stale
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const plugin = fileURLToPath(new URL("../plugins/pstack/", import.meta.url));
const header = source => `# Generated from ${source} by scripts/build-codex.mjs. Do not edit.`;

function frontmatter(markdown, file) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n+([\s\S]*)$/);
  if (!match) throw new Error(`${file} has no frontmatter`);
  return { field: key => match[1].match(new RegExp(`^${key}: (.*)$`, "m"))?.[1], body: match[2] };
}

function agentToml(file) {
  const { field, body } = frontmatter(readFileSync(path.join(plugin, file), "utf8"), file);
  // JSON string escapes are a subset of TOML basic-string escapes.
  return [
    header(file),
    `name = ${JSON.stringify(field("name"))}`,
    `description = ${JSON.stringify(field("description"))}`,
    `developer_instructions = ${JSON.stringify(body.trimEnd())}`,
    "",
  ].join("\n");
}

function skillPolicy(file) {
  const { field } = frontmatter(readFileSync(path.join(plugin, file), "utf8"), file);
  if (field("disable-model-invocation") !== "true") return null;
  return `${header(file)}\npolicy:\n  allow_implicit_invocation: false\n`;
}

const outputs = new Map();
for (const name of readdirSync(path.join(plugin, "agents")).filter(f => f.endsWith(".md"))) {
  outputs.set(`codex/agents/${name.replace(/\.md$/, ".toml")}`, agentToml(`agents/${name}`));
}
for (const name of readdirSync(path.join(plugin, "skills"))) {
  outputs.set(`skills/${name}/agents/openai.yaml`, skillPolicy(`skills/${name}/SKILL.md`));
}

const check = process.argv.includes("--check");
const stale = [];
for (const [relative, content] of outputs) {
  const target = path.join(plugin, relative);
  const current = existsSync(target) ? readFileSync(target, "utf8") : null;
  if (current === content) continue;
  if (check) stale.push(relative);
  else if (content === null) rmSync(target);
  else {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}
if (stale.length) {
  console.error(`Stale Codex files, run node scripts/build-codex.mjs:\n  ${stale.join("\n  ")}`);
  process.exitCode = 1;
}
