#!/usr/bin/env node
// Three-way merges upstream pstack into plugins/pstack.
// base = upstream at the recorded revision, theirs = upstream at the target revision, ours = this tree.
//
//   node scripts/sync-upstream.mjs [revision]   merge upstream (default: upstream main) and record it
//   node scripts/sync-upstream.mjs --status     list files that differ from the recorded revision

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const configPath = path.join(repo, "upstream.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const pluginRoot = path.join(repo, config.target);

const git = (cwd, args, options = {}) => execFileSync("git", args, { cwd, maxBuffer: 1 << 28, ...options });

function checkout() {
  const cache = path.join(tmpdir(), "pstack-universal-upstream");
  if (!existsSync(path.join(cache, ".git"))) {
    git(tmpdir(), ["clone", "--quiet", "--no-checkout", config.repository, cache]);
  }
  git(cache, ["fetch", "--quiet", "origin"]);
  return cache;
}

function upstreamFiles(cache, revision) {
  const out = git(cache, ["ls-tree", "-r", "--name-only", revision, "--", ...config.include.map(p => `${config.subdirectory}/${p}`)]);
  return new Set(out.toString().split("\n").filter(Boolean).map(p => p.slice(config.subdirectory.length + 1)));
}

const blob = (cache, revision, file) => git(cache, ["show", `${revision}:${config.subdirectory}/${file}`]);
const local = file => {
  const target = path.join(pluginRoot, file);
  return existsSync(target) ? readFileSync(target) : null;
};
const same = (a, b) => (a === null ? b === null : b !== null && a.equals(b));

function write(file, content) {
  const target = path.join(pluginRoot, file);
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

function status(cache) {
  const files = upstreamFiles(cache, config.revision);
  const changed = [...files].filter(file => !same(local(file), blob(cache, config.revision, file)));
  console.log(`${changed.length} of ${files.size} upstream files differ from ${config.revision.slice(0, 7)}:`);
  for (const file of changed.sort()) console.log(`  ${local(file) === null ? "deleted " : "modified"} ${file}`);
}

function sync(cache, requested) {
  const target = git(cache, ["rev-parse", requested ?? "origin/HEAD"]).toString().trim();
  const baseFiles = config.revision ? upstreamFiles(cache, config.revision) : new Set();
  const targetFiles = upstreamFiles(cache, target);
  const report = { added: [], updated: [], merged: [], deleted: [], conflicts: [] };

  for (const file of [...new Set([...baseFiles, ...targetFiles])].sort()) {
    const base = baseFiles.has(file) ? blob(cache, config.revision, file) : null;
    const theirs = targetFiles.has(file) ? blob(cache, target, file) : null;
    const ours = local(file);
    if (same(ours, theirs) || same(base, theirs)) continue;
    if (same(ours, base)) {
      write(file, theirs);
      report[theirs === null ? "deleted" : base === null ? "added" : "updated"].push(file);
    } else if (ours !== null && base !== null && theirs !== null) {
      const result = merge(file, ours, base, theirs);
      write(file, result.content);
      report[result.clean ? "merged" : "conflicts"].push(file);
    } else {
      report.conflicts.push(`${file} (${ours === null ? "deleted here" : theirs === null ? "deleted upstream" : "added on both sides"})`);
    }
  }

  config.revision = target;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  for (const [kind, files] of Object.entries(report)) {
    if (files.length) console.log(`${kind} (${files.length}):\n${files.map(f => `  ${f}`).join("\n")}`);
  }
  console.log(`Recorded upstream ${target.slice(0, 7)}.`);
  if (report.conflicts.length) {
    console.log("Resolve the conflict markers and the listed files before committing.");
    process.exitCode = 1;
  }
}

const cache = checkout();
const [arg] = process.argv.slice(2);
if (arg === "--status") status(cache);
else sync(cache, arg);
