// Every skill that names a Cursor tool, model, or path links to the runtime files under its H1.
//   node scripts/runtime-pointer.mjs   insert the pointer wherever it is missing
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const pointer =
  "Outside Cursor, first read [the Claude Code runtime](../../runtime/claude-code.md) or [the Codex runtime](../../runtime/codex.md). It maps the Cursor tools, models, and paths this skill names.";

const cursorTerms = /subagent_type|\bTask\b|AskQuestion|\.cursor|cursor-team-kit|generalPurpose|run_in_background|Cursor|pstack-models|agent-transcripts|grok-|claude-opus|subagent|spawn|create-skill/;

const files = dir =>
  readdirSync(dir, { recursive: true }).map(f => path.join(dir, f)).filter(f => /\.(md|ts|mjs|sh)$/.test(f));

export function skillsNeedingPointer(skillsRoot) {
  return readdirSync(skillsRoot)
    .filter(name => !name.startsWith("principle-"))
    .filter(name => files(path.join(skillsRoot, name)).some(f => cursorTerms.test(readFileSync(f, "utf8"))));
}

export function insertPointer(source) {
  if (source.includes(pointer)) return source;
  const heading = source.match(/^# .*\n\n/m);
  if (!heading) throw new Error("no H1 heading");
  const at = heading.index + heading[0].length;
  return `${source.slice(0, at)}${pointer}\n\n${source.slice(at)}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plugins = fileURLToPath(new URL("../plugins/", import.meta.url));
  for (const plugin of readdirSync(plugins)) {
    const root = path.join(plugins, plugin, "skills");
    for (const name of skillsNeedingPointer(root)) {
      const file = path.join(root, name, "SKILL.md");
      const source = readFileSync(file, "utf8");
      const updated = insertPointer(source);
      if (updated !== source) {
        writeFileSync(file, updated);
        console.log(`Inserted the runtime pointer in ${plugin}/skills/${name}/SKILL.md`);
      }
    }
  }
}
