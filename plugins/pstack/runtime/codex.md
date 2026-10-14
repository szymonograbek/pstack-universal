# Codex runtime

pstack's skills are written for Cursor. Their text stays as upstream wrote it. This file maps each Cursor tool, model, and path they name to its Codex equivalent. Apply the mapping silently and follow the skill otherwise as written.

This marketplace ships two plugins, `pstack` and `cursor-team-kit`, with identical copies of this file. A plugin's skills live at `../skills/<name>/SKILL.md` from this file and are invoked as `$<plugin>:<name>`. Resolve a bundled skill by reading its `SKILL.md`, before looking for standalone installations. When writing a plan or a subagent brief, expand resource paths to absolute paths in the current installation.

## Subagents

| Cursor | Codex |
|---|---|
| `Task` tool | The subagent spawn tool. Collect results with its wait tool and send follow-ups with its input tool. |
| `subagent_type: generalPurpose` | The default agent |
| `subagent_type: "poteto-agent"` | The registered `poteto-agent` custom agent |
| `subagent_type: "comment-sicko"` | The registered `comment-sicko` custom agent |
| `subagent_type: "ci-watcher"`, `"thermo-nuclear-code-quality-review"` | The registered custom agent of that name |
| `readonly: true` | The default agent with "read-only: do not edit files or run mutating commands" in the brief |
| `readonly: false`, agent mode | The default agent |
| `run_in_background: true` | Spawn, keep working, and wait only when the result is needed |
| `environment: "cloud"` | No cloud agents. Run locally, in a separate worktree when the worker writes. |
| `model: <slug>` | `model` and `reasoning_effort`, split per Models below |

`$pstack:setup-pstack` registers both plugins' custom agents in `${CODEX_HOME:-$HOME/.codex}/config.toml`. If the runtime does not expose a role a skill names, say that setup and a new session are required. Do not present a default agent as the registered role. Put the absolute paths of pstack's `skills/poteto-mode/SKILL.md` and of this file in every `poteto-agent` brief.

Give each child its goal, scope, constraints, resource paths, and completion criteria. When the spawn tool needs a fresh context to override a model, spawn a fresh child with the complete brief. Batch work within the runtime's agent limit. A panel size in a skill does not raise that limit.

## Models

Use only OpenAI models the current runtime exposes. The model choices live in a `## pstack model configuration` section of `~/.codex/AGENTS.md`, written by `$pstack:setup-pstack`. Codex loads that file into every session, as Cursor's `alwaysApply` does for `~/.cursor/rules/pstack-models.mdc`. Read "the `pstack-models.mdc` rule" as that section. Its values are `model/effort` pairs. Pass them as separate `model` and `reasoning_effort` arguments. Never pass the joined pair as a model slug.

A skill's built-in Cursor default maps by the work it names.

| Cursor default | Codex |
|---|---|
| `claude-opus-5-5-*`: planning, knowledge-heavy analysis, synthesis, complex judgment, substantive prose | `gpt-6-astra/low` |
| `grok-*`, `composer-*`: code changes, exploration, evidence collection, routine rule-based review, verification | `gpt-6.1-sol/medium` |
| Optional narrow factual lookups, only when explicitly selected | `gpt-6-luna/high` |

Astra stays at `low` unless the user approves a higher effort. A budget or "raise one step" instruction in a skill applies to Sol only. Ignore the `fast` suffix and the fast-or-standard speed choice. `inherit-parent` and `auto` are valid only when the parent already runs the model and effort the role needs. Otherwise delegate that phase to a matching agent.

Four-agent design and adversarial review panels use one Astra and three Sol agents. Code candidate panels use four Sol agents. Where a skill asks for a different model family, use Astra against Sol and say in the reply that the panel is single-vendor. Validate each pair against the runtime before dispatch. If a required pair is unavailable, report the blocker instead of silently substituting.

## Setup

`$pstack:setup-pstack` follows its steps with these changes. Step 1 detects OpenAI models and the reasoning efforts each supports, and every value is a `model/effort` pair. Step 3 offers the budget for Sol only, per Models. Step 5 writes or replaces only the `## pstack model configuration` section of `~/.codex/AGENTS.md`, with the role lines and the `# budget` line but no `.mdc` frontmatter, and keeps the rest of the file.

Then register the custom agents from a persistent checkout of this repository, not the versioned plugin cache, which an update deletes. Accept a checkout path from the user, or find an existing checkout whose Git remote is this plugin's repository. Otherwise ask where to clone it. Run the bundled installer once per plugin, with absolute paths and the active Codex executable (`command -v codex`):

```sh
node <checkout>/plugins/pstack/skills/setup-pstack/scripts/install-agents.mjs <checkout>/plugins/pstack <codex-binary>
node <checkout>/plugins/pstack/skills/setup-pstack/scripts/install-agents.mjs <checkout>/plugins/cursor-team-kit <codex-binary>
```

It registers `poteto-agent`, `comment-sicko`, `ci-watcher`, and `thermo-nuclear-code-quality-review` in `${CODEX_HOME:-$HOME/.codex}/config.toml`, pointing at the checkout's generated `codex/agents/*.toml`. It refuses to replace a registration that points elsewhere, such as an older pstack port. Name the conflicting path and ask before rerunning with `--replace`. Then tell the user to start a new session and launch each role once. Registration alone does not prove that dispatch works.

## Other Cursor features

| Cursor | Codex |
|---|---|
| `AskQuestion` | The structured user-input tool when the session exposes it, else a plain question |
| `create-skill` built-in | `skill-creator` |
| A skill from `cursor-team-kit`, such as `deslop`, `control-cli`, or `control-ui` | `$cursor-team-kit:<name>`, from the plugin of that name in this marketplace. Without it, use a same-named installed skill. Without either, strip slop from the diff yourself, or drive the surface directly through the shell or a browser tool. |
| Cursor's built-in babysit skill | None. The Babysit playbook stands alone. |
| `/loop` | No built-in. Keep the run going in this turn, or use the runtime's goal or recurring-task mechanism only when the user has asked for that lifecycle. |
| Plan Mode | Plan mode |
| The `mcps/` directory, the available-tools map | The MCP tools in this session |
| Cursor restart | Codex restart. Spawned agents die with the session. |
| Cursor dashboard, cloud agent status | None. Probe the branch, the PR, and the ledger. |

A workflow does not by itself authorize commits, pushes, PRs, messages, deployments, or scheduled tasks. The user's task and repository instructions define that authority.

## Paths

| Cursor | Codex |
|---|---|
| `agent-transcripts/` directory the system prompt names | `${CODEX_HOME:-$HOME/.codex}/sessions/YYYY/MM/DD/rollout-*.jsonl`. Keep only rollouts whose `session_meta` `cwd` is the active workspace. |
| `~/.cursor/projects/*/` | The same sessions tree. Never read rollouts from other workspaces. |
| `.cursor/skills/` | `.agents/skills/` |
| `~/.cursor/skills/` | `~/.agents/skills/` |
| `~/.cursor/plugins/` | `${CODEX_HOME:-$HOME/.codex}/plugins/` |
| `.cursor/rules/` | `AGENTS.md` |
