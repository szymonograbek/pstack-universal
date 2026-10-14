#!/usr/bin/env node

import { spawn } from "node:child_process";
import { lstat, mkdir, readdir, readFile, realpath, rename, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";


function isMissing(error) {
  return error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

async function inspectPath(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

async function resolveSources(pluginRoot) {
  const directory = path.join(path.resolve(pluginRoot), "codex", "agents");
  const agents = (await readdir(directory)).filter(file => file.endsWith(".toml")).map(file => ({ name: file.slice(0, -5) }));
  if (agents.length === 0) throw new Error(`No Codex agents in ${directory}`);
  return Promise.all(agents.map(async agent => {
    const configuredSource = path.join(path.resolve(pluginRoot), "codex", "agents", `${agent.name}.toml`);
    let source;
    try {
      source = await realpath(configuredSource);
    } catch (error) {
      if (isMissing(error)) throw new Error(`Agent source does not exist: ${configuredSource}`);
      throw error;
    }
    if (!(await stat(source)).isFile()) throw new Error(`Agent source is not a file: ${configuredSource}`);
    const description = (await readFile(source, "utf8")).match(/^description = (".*")$/m)?.[1];
    if (!description) throw new Error(`Agent source has no description: ${configuredSource}`);
    return { ...agent, source, description: JSON.parse(description) };
  }));
}

function startConfigClient(codexBinary, codexHome) {
  const child = spawn(codexBinary, ["app-server", "--listen", "stdio://"], {
    env: { ...process.env, CODEX_HOME: codexHome },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let nextId = 1;
  let stdout = "";
  let stderr = "";
  const pending = new Map();

  function rejectPending(error) {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.stdout.on("data", chunk => {
    stdout += chunk;
    const lines = stdout.split("\n");
    stdout = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        rejectPending(error);
        child.kill();
        return;
      }
      if (!("id" in message) || !pending.has(message.id)) continue;
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message ?? "Codex config request failed"));
      else request.resolve(message.result);
    }
  });
  const exited = new Promise((resolve, reject) => {
    child.on("error", error => {
      rejectPending(error);
      reject(error);
    });
    child.on("close", code => {
      if (code === 0 || code === null) {
        rejectPending(new Error("Codex config server closed before replying"));
        resolve();
      } else {
        const error = new Error(`Codex config server exited with code ${code}: ${stderr.trim()}`);
        rejectPending(error);
        reject(error);
      }
    });
  });

  function request(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }
  function notify(method, params) {
    child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }
  async function close() {
    child.stdin.end();
    await exited;
  }
  return { request, notify, close };
}

function getUserLayer(configResult) {
  const layer = configResult.layers?.find(candidate => candidate.name?.type === "user");
  if (!layer || typeof layer.version !== "string") throw new Error("Codex did not return a writable user config layer");
  return layer;
}

function validateRegistrations(userConfig, resolvedAgents, replace) {
  const configuredAgents = userConfig.agents;
  if (configuredAgents !== undefined && (configuredAgents === null || typeof configuredAgents !== "object")) {
    throw new Error("Codex user config has an invalid agents value");
  }
  const edits = [];
  for (const agent of resolvedAgents) {
    const registration = configuredAgents?.[agent.name];
    if (registration !== undefined && (registration === null || typeof registration !== "object")) {
      throw new Error(`Codex user config has an invalid agents.${agent.name} registration`);
    }
    if (!replace && registration?.config_file !== undefined && registration.config_file !== agent.source) {
      throw new Error(`Refusing to replace agents.${agent.name}.config_file: ${registration.config_file}`);
    }
    if (registration?.description !== agent.description) {
      edits.push({ keyPath: `agents.${agent.name}.description`, value: agent.description, mergeStrategy: "replace" });
    }
    if (registration?.config_file !== agent.source) {
      edits.push({ keyPath: `agents.${agent.name}.config_file`, value: agent.source, mergeStrategy: "replace" });
    }
  }
  return edits;
}

async function inspectLegacyLinks(codexHome, resolvedAgents) {
  const agentsDirectory = path.join(codexHome, "agents");
  const backupDirectory = path.join(codexHome, "backups", "pstack-agent-symlinks");
  return Promise.all(resolvedAgents.map(async agent => {
    const legacyPath = path.join(agentsDirectory, `${agent.name}.toml`);
    const legacyStat = await inspectPath(legacyPath);
    if (!legacyStat) return undefined;
    if (!legacyStat.isSymbolicLink()) throw new Error(`Refusing to replace existing file: ${legacyPath}`);
    let target;
    try {
      target = await realpath(legacyPath);
    } catch (error) {
      if (isMissing(error)) throw new Error(`Refusing to replace broken symlink: ${legacyPath}`);
      throw error;
    }
    if (target !== agent.source) throw new Error(`Refusing to replace existing symlink: ${legacyPath}`);
    const backupPath = path.join(backupDirectory, `${agent.name}.toml`);
    if (await inspectPath(backupPath)) throw new Error(`Refusing to replace existing backup: ${backupPath}`);
    return { legacyPath, backupPath };
  }));
}

export async function installAgents(pluginRoot, codexHome, codexBinary = "codex", { replace = false } = {}) {
  const resolvedCodexHome = path.resolve(codexHome);
  const resolvedAgents = await resolveSources(pluginRoot);
  const legacyLinks = await inspectLegacyLinks(resolvedCodexHome, resolvedAgents);
  await mkdir(resolvedCodexHome, { recursive: true });
  const client = startConfigClient(codexBinary, resolvedCodexHome);
  try {
    await client.request("initialize", {
      clientInfo: { name: "pstack-agent-installer", version: "1.0" },
      capabilities: { experimentalApi: true },
    });
    client.notify("initialized", {});
    const userLayer = getUserLayer(await client.request("config/read", { includeLayers: true }));
    const edits = validateRegistrations(userLayer.config, resolvedAgents, replace);
    if (edits.length > 0) {
      await client.request("config/batchWrite", { edits, expectedVersion: userLayer.version, reloadUserConfig: false });
    }
  } finally {
    await client.close();
  }
  const linksToMove = legacyLinks.filter(link => link !== undefined);
  if (linksToMove.length > 0) {
    await mkdir(path.dirname(linksToMove[0].backupPath), { recursive: true });
    await Promise.all(linksToMove.map(link => rename(link.legacyPath, link.backupPath)));
  }
  return resolvedAgents.map(agent => ({ name: agent.name, configFile: agent.source }));
}

async function runCli() {
  const replace = process.argv.includes("--replace");
  const arguments_ = process.argv.slice(2).filter(argument => argument !== "--replace");
  if (arguments_.length < 1 || arguments_.length > 2 || !path.isAbsolute(arguments_[0])
    || (arguments_[1] !== undefined && !path.isAbsolute(arguments_[1]))) {
    throw new Error("Usage: node install-agents.mjs <absolute-plugin-root> [absolute-codex-binary] [--replace]");
  }
  const codexHome = process.env.CODEX_HOME || path.join(homedir(), ".codex");
  for (const agent of await installAgents(arguments_[0], codexHome, arguments_[1], { replace })) {
    console.log(`Registered ${agent.name}: ${agent.configFile}`);
  }
}

const invokedPath = process.argv[1];
if (invokedPath && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  runCli().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
