# Claude Code runtime

pstack's skills are written for Cursor. Their text stays as upstream wrote it. This file maps each Cursor tool, model, and path they name to its Claude Code equivalent. Apply the mapping silently and follow the skill otherwise as written.

Bundled skills live at `../skills/<name>/SKILL.md` from this file and are invoked as `/pstack:<name>`. Every skill except `setup-pstack` has `disable-model-invocation: true`, so the `Skill` tool cannot load them. Read a routed skill's `SKILL.md` with the `Read` tool instead, as poteto-mode already does.

## Subagents

| Cursor | Claude Code |
|---|---|
| `Task` tool | `Agent` tool |
| `subagent_type: generalPurpose` | `subagent_type: "general-purpose"` |
| `subagent_type: "poteto-agent"` | `subagent_type: "pstack:poteto-agent"` |
| `subagent_type: "comment-sicko"` | `subagent_type: "pstack:comment-sicko"` |
| `readonly: true` | `general-purpose` with "read-only: do not edit files or run mutating commands" in the brief. `Explore` replaces the system prompt, so don't substitute it. |
| `readonly: false`, agent mode | `general-purpose`. MCP tools stay available either way. |
| `run_in_background: true` | `run_in_background: true` |
| `environment: "cloud"` | No cloud agents. Run locally with `isolation: "worktree"` when the worker writes. |
| `model: <slug>` | `model` and `effort`, split per Models below |
| Resume or message an agent | `SendMessage` to the agent's ID |

Put the absolute path of `../skills/poteto-mode/SKILL.md` and of this file in every `pstack:poteto-agent` brief.

## Models

The model choices live in a `## pstack model configuration` section of `~/.claude/CLAUDE.md`, written by `/pstack:setup-pstack`. Claude Code loads that file into every session, as Cursor's `alwaysApply` does for `~/.cursor/rules/pstack-models.mdc`. Read "the `pstack-models.mdc` rule" as that section. Its values are `model/effort` pairs such as `opus/xhigh`. Pass them as the `Agent` tool's separate `model` and `effort` arguments.

A skill's built-in Cursor default maps by family. The effort token carries over unchanged.

| Cursor default | Claude Code |
|---|---|
| `claude-opus-5-5-<effort>` | `opus/<effort>` |
| `grok-4.7-<effort>-fast`, `grok-*`, `composer-*` | `sonnet/<effort>` |
| any other slug | `inherit-parent` |

The `model` argument accepts `fable`, `opus`, `sonnet`, and `haiku`. The `effort` argument accepts `low`, `medium`, `high`, `xhigh`, and `max`. The Agent tool has no fast mode, so ignore the `fast` suffix and the fast-or-standard speed choice. `inherit-parent` and `auto` mean omit both `model` and `effort`.

Claude Code offers one model family. Where a skill asks for a different family (a cross-judge, a diverse panel, a second opinion), use a different model, such as `opus` against `sonnet` or `fable`, and say in the reply that the panel is single-family.

## Setup

`/pstack:setup-pstack` follows its steps with these changes. Step 1 detects models from the `Agent` tool's `model` and `effort` arguments, and every value is a `model/effort` pair. Step 5 writes or replaces only the `## pstack model configuration` section of `~/.claude/CLAUDE.md`, with the role lines and the `# budget` line but no `.mdc` frontmatter, and keeps the rest of the file. The plugin installs `pstack:poteto-agent` and `pstack:comment-sicko` itself, so there is nothing to register.

## Other Cursor features

| Cursor | Claude Code |
|---|---|
| `AskQuestion` | `AskUserQuestion` |
| `create-skill` built-in | `plugin-dev:skill-development` when installed, else `skill-creator` |
| `deslop`, `control-cli`, `control-ui` from `cursor-team-kit` | Same-named skill when one is installed. Without `deslop`, strip slop from the diff yourself. Without a control skill, drive the surface directly through Bash or a browser tool. |
| Cursor's built-in babysit skill | None. The Babysit playbook stands alone. |
| `/loop` | `/loop` |
| Plan Mode | Plan mode |
| The `mcps/` directory, the available-tools map | The `mcp__<server>__<tool>` tools in this session, plus `ToolSearch` for deferred ones |
| Cursor restart | Claude Code restart. Background agents die with the session. |
| Cursor dashboard, cloud agent status | None. Probe the branch, the PR, and the ledger. |

## Paths

| Cursor | Claude Code |
|---|---|
| `agent-transcripts/` directory the system prompt names | `~/.claude/projects/<slug>/`, where `<slug>` is the absolute working directory with every character other than a letter, digit, or `-` replaced by `-`. The session is `<session-id>.jsonl`. Its subagents are `<session-id>/subagents/*.jsonl`. |
| `~/.cursor/projects/*/` | `~/.claude/projects/*/`. The same rule applies: never glob across projects. |
| `.cursor/skills/` | `.claude/skills/` |
| `~/.cursor/skills/` | `~/.claude/skills/` |
| `~/.cursor/plugins/` | `~/.claude/plugins/cache/` |
| `.cursor/rules/` | `CLAUDE.md` |
