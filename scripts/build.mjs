// Generates derived files in every plugin under plugins/, so they cannot drift from their sources.
//   agents/<name>.md                        -> codex/agents/<name>.toml (custom agent registered by setup-pstack)
//   disable-model-invocation in SKILL.md    -> skills/<name>/agents/openai.yaml (Codex ignores the frontmatter key)
//   plugins/pstack/runtime/*.md             -> runtime/*.md in every other plugin
//
//   node scripts/build.mjs           write the files
//   node scripts/build.mjs --check   fail when any generated file is stale
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const plugins = fileURLToPath(new URL("../plugins/", import.meta.url));
const runtimeSource = "pstack/runtime";
const header = source => `# Generated from ${source} by scripts/build.mjs. Do not edit.`;

function frontmatter(markdown, file) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n+([\s\S]*)$/);
  if (!match) throw new Error(`${file} has no frontmatter`);
  return { field: key => match[1].match(new RegExp(`^${key}: (.*)$`, "m"))?.[1], body: match[2] };
}

function agentToml(file) {
  const { field, body } = frontmatter(readFileSync(path.join(plugins, file), "utf8"), file);
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
  const { field } = frontmatter(readFileSync(path.join(plugins, file), "utf8"), file);
  if (field("disable-model-invocation") !== "true") return null;
  return `${header(file)}\npolicy:\n  allow_implicit_invocation: false\n`;
}

const outputs = new Map();
for (const plugin of readdirSync(plugins)) {
  for (const name of readdirSync(path.join(plugins, plugin, "agents")).filter(f => f.endsWith(".md"))) {
    outputs.set(`${plugin}/codex/agents/${name.replace(/\.md$/, ".toml")}`, agentToml(`${plugin}/agents/${name}`));
  }
  for (const name of readdirSync(path.join(plugins, plugin, "skills"))) {
    outputs.set(`${plugin}/skills/${name}/agents/openai.yaml`, skillPolicy(`${plugin}/skills/${name}/SKILL.md`));
  }
  if (`${plugin}/runtime` === runtimeSource) continue;
  for (const name of readdirSync(path.join(plugins, runtimeSource))) {
    const source = readFileSync(path.join(plugins, runtimeSource, name), "utf8");
    outputs.set(`${plugin}/runtime/${name}`, `<!-- Generated from plugins/${runtimeSource}/${name} by scripts/build.mjs. Do not edit. -->\n\n${source}`);
  }
}

const check = process.argv.includes("--check");
const stale = [];
for (const [relative, content] of outputs) {
  const target = path.join(plugins, relative);
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
  console.error(`Stale generated files, run node scripts/build.mjs:\n  ${stale.join("\n  ")}`);
  process.exitCode = 1;
}
