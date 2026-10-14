#!/usr/bin/env node
// Three-way merges each upstream plugin in upstream.json into its target directory.
// base = upstream at the plugin's recorded revision, theirs = upstream at the target revision, ours = this tree.
// A plugin with no recorded revision is imported as-is.
//
//   node scripts/sync-upstream.mjs [revision]   merge upstream (default: upstream main) and record it
//   node scripts/sync-upstream.mjs --status     list files that differ from each recorded revision

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const configPath = path.join(repo, "upstream.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));

const git = (cwd, args, options = {}) => execFileSync("git", args, { cwd, maxBuffer: 1 << 28, ...options });

function checkout() {
  const cache = path.join(tmpdir(), "pstack-universal-upstream");
  if (!existsSync(path.join(cache, ".git"))) {
    git(tmpdir(), ["clone", "--quiet", "--no-checkout", config.repository, cache]);
  }
  git(cache, ["fetch", "--quiet", "origin"]);
  return cache;
}

function upstreamFiles(cache, plugin, revision) {
  const out = git(cache, ["ls-tree", "-r", "--name-only", revision, "--", ...plugin.include.map(p => `${plugin.subdirectory}/${p}`)]);
  return new Set(out.toString().split("\n").filter(Boolean).map(p => p.slice(plugin.subdirectory.length + 1)));
}

const blob = (cache, plugin, revision, file) => git(cache, ["show", `${revision}:${plugin.subdirectory}/${file}`]);
const local = (plugin, file) => {
  const target = path.join(repo, plugin.target, file);
  return existsSync(target) ? readFileSync(target) : null;
};
const same = (a, b) => (a === null ? b === null : b !== null && a.equals(b));

function write(plugin, file, content) {
  const target = path.join(repo, plugin.target, file);
  if (content === null) return rmSync(target, { force: true });
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function merge(file, ours, base, theirs) {
  const scratch = mkdtempSync(path.join(tmpdir(), "pstack-merge-"));
  try {
    const paths = ["ours", "base", "theirs"].map(name => path.join(scratch, name));
    [ours, base, theirs].forEach((content, i) => writeFileSync(paths[i], content));
    try {
      return { content: git(scratch, ["merge-file", "-p", "-L", "ours", "-L", "upstream-base", "-L", "upstream", ...paths]), clean: true };
    } catch (error) {
      if (error.status > 0 && error.stdout) return { content: error.stdout, clean: false };
      throw error;
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function status(cache, plugin) {
  const files = upstreamFiles(cache, plugin, plugin.revision);
  const changed = [...files].filter(file => !same(local(plugin, file), blob(cache, plugin, plugin.revision, file)));
  console.log(`${plugin.target}: ${changed.length} of ${files.size} upstream files differ from ${plugin.revision.slice(0, 7)}`);
  for (const file of changed.sort()) console.log(`  ${local(plugin, file) === null ? "deleted " : "modified"} ${file}`);
}

function sync(cache, plugin, target) {
  const baseFiles = plugin.revision ? upstreamFiles(cache, plugin, plugin.revision) : new Set();
  const targetFiles = upstreamFiles(cache, plugin, target);
  const report = { added: [], updated: [], merged: [], deleted: [], conflicts: [] };

  for (const file of [...new Set([...baseFiles, ...targetFiles])].sort()) {
    const base = baseFiles.has(file) ? blob(cache, plugin, plugin.revision, file) : null;
    const theirs = targetFiles.has(file) ? blob(cache, plugin, target, file) : null;
    const ours = local(plugin, file);
    if (same(ours, theirs) || same(base, theirs)) continue;
    if (same(ours, base)) {
      write(plugin, file, theirs);
      report[theirs === null ? "deleted" : base === null ? "added" : "updated"].push(file);
    } else if (ours !== null && base !== null && theirs !== null) {
      const result = merge(file, ours, base, theirs);
      write(plugin, file, result.content);
      report[result.clean ? "merged" : "conflicts"].push(file);
    } else {
      report.conflicts.push(`${file} (${ours === null ? "deleted here" : theirs === null ? "deleted upstream" : "added on both sides"})`);
    }
  }

  plugin.revision = target;
  console.log(`${plugin.target}: recorded upstream ${target.slice(0, 7)}.`);
  for (const [kind, files] of Object.entries(report)) {
    if (files.length) console.log(`  ${kind} (${files.length}):\n${files.map(f => `    ${f}`).join("\n")}`);
  }
  return report.conflicts.length;
}

function syncAll(cache, requested) {
  const target = git(cache, ["rev-parse", requested ?? "origin/HEAD"]).toString().trim();
  const conflicts = config.plugins.reduce((count, plugin) => count + sync(cache, plugin, target), 0);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  if (conflicts) {
    console.log("Resolve the conflict markers and the listed files before committing.");
    process.exitCode = 1;
  }
}

const cache = checkout();
const [arg] = process.argv.slice(2);
if (arg === "--status") config.plugins.filter(p => p.revision).forEach(plugin => status(cache, plugin));
else syncAll(cache, arg);
