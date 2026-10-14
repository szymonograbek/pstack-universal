# Claude Code runtime

pstack's skills are written for Cursor. Their text stays as upstream wrote it. This file maps each Cursor tool, model, and path they name to its Claude Code equivalent. Apply the mapping silently and follow the skill otherwise as written.

This marketplace ships two plugins, `pstack` and `cursor-team-kit`, with identical copies of this file. A plugin's skills live at `../skills/<name>/SKILL.md` from this file and are invoked as `/<plugin>:<name>`. The `Skill` tool cannot load a skill with `disable-model-invocation: true`, which is every pstack skill except `setup-pstack`. Read a routed skill's `SKILL.md` with the `Read` tool instead, as poteto-mode already does.

## Subagents

| Cursor | Claude Code |
|---|---|
| `Task` tool | `Agent` tool |
| `subagent_type: generalPurpose` | `subagent_type: "general-purpose"` |
| `subagent_type: "poteto-agent"` | `subagent_type: "pstack:poteto-agent"` |
| `subagent_type: "comment-sicko"` | `subagent_type: "pstack:comment-sicko"` |
| `subagent_type: "ci-watcher"`, `"thermo-nuclear-code-quality-review"` | `subagent_type: "cursor-team-kit:<name>"` |
| `readonly: true` | `general-purpose` with "read-only: do not edit files or run mutating commands" in the brief. `Explore` replaces the system prompt, so don't substitute it. |
| `readonly: false`, agent mode | `general-purpose`. MCP tools stay available either way. |
| `run_in_background: true` | `run_in_background: true` |
| `environment: "cloud"` | No cloud agents. Run locally with `isolation: "worktree"` when the worker writes. |
| `model: <slug>` | `model` and `effort`, split per Models below |
| Resume or message an agent | `SendMessage` to the agent's ID |

Put the absolute paths of pstack's `skills/poteto-mode/SKILL.md` and of this file in every `pstack:poteto-agent` brief.

## Models

The model choices live in a `## pstack model configuration` section of `~/.claude/CLAUDE.md`, written by `/pstack:setup-pstack`. Claude Code loads that file into every session, as Cursor's `alwaysApply` does for `~/.cursor/rules/pstack-models.mdc`. Read "the `pstack-models.mdc` rule" as that section. Its values are `model/effort` pairs such as `opus/medium`. Pass them as the `Agent` tool's separate `model` and `effort` arguments.

Upstream's defaults assume unlimited inference, with every role at `xhigh`. On Claude Code, a role with no line in the section uses its default from the Plans table below, in the column the section's `# plan` line names. With no section, use the Max 5x column. This replaces each skill's built-in Cursor default. A spawn that names no role maps by family, with the effort capped at the plan's ceiling: `claude-opus-*` becomes `opus`, and `grok-*` or `composer-*` becomes `sonnet`.

The `model` argument accepts `fable`, `opus`, `sonnet`, and `haiku`. The `effort` argument accepts `low`, `medium`, `high`, `xhigh`, and `max`. The Agent tool has no fast mode, so ignore the `fast` suffix and the fast-or-standard speed choice. `inherit-parent` and `auto` mean omit both `model` and `effort`.

poteto-mode's "match the model to the job" step may raise a role's effort one step, but never above the plan's ceiling. Lowering is always allowed.

Claude Code offers one model family. Where a skill asks for a different family (a cross-judge, a diverse panel, a second opinion), use a different model, such as `opus` against `sonnet`, and say in the reply that the panel is single-family.

### Plans

| Role | Pro ($20) | Max 5x ($100) | Max 20x ($200) |
|---|---|---|---|
| feature, refactoring | `sonnet/medium` | `opus/medium` | `sonnet/xhigh` |
| bug-fix | `sonnet/high` | `opus/medium` | `sonnet/xhigh` |
| perf-issue | `sonnet/high` | `opus/medium` | `sonnet/xhigh` |
| hillclimb | `sonnet/medium` | `opus/medium` | `sonnet/xhigh` |
| judgment and prose | `opus/medium` | `opus/medium` | `opus/xhigh` |
| hardest tasks | `opus/medium` | `opus/high` | `opus/xhigh` |
| how explorer | `sonnet/low` | `sonnet/medium` | `sonnet/xhigh` |
| how explainer | `sonnet/high` | `opus/medium` | `opus/xhigh` |
| why investigators | `sonnet/low` | `sonnet/medium` | `sonnet/xhigh` |
| why synthesizer | `sonnet/high` | `opus/medium` | `opus/xhigh` |
| reflect tooling | `sonnet/medium` | `sonnet/medium` | `sonnet/xhigh` |
| reflect judgment, divergent, synthesizer | `sonnet/high` | `opus/medium` | `opus/xhigh` |
| arena runners | `sonnet/high, sonnet/medium` | `opus/medium, sonnet/high` | `opus/xhigh, sonnet/xhigh` |
| arena cross-judge pool | `opus/medium` | `opus/medium` | `opus/xhigh, sonnet/xhigh` |
| swarm workers | `sonnet/low` | `sonnet/medium` | `sonnet/xhigh` |
| architect runners | `opus/medium, sonnet/high` | `opus/medium, sonnet/high` | `opus/xhigh, sonnet/xhigh` |
| interrogate reviewers | `opus/medium, sonnet/high` | `opus/medium, sonnet/high` | `opus/xhigh, sonnet/xhigh` |
| Effort ceiling | `high` | `high` | `max` |

Max 20x keeps upstream's defaults, with Opus where upstream names Opus and Sonnet where it names Grok. Pro runs on Sonnet, keeping Opus for the hardest tasks, prose, and the design and review panels. Max 5x runs on Opus at medium effort, keeping Sonnet for exploration, evidence collection, tooling review, and swarm workers.

## Setup

`/pstack:setup-pstack` follows its steps with these changes.

- Step 1 detects models from the `Agent` tool's `model` and `effort` arguments, and every value is a `model/effort` pair.
- Step 3 (a) asks for the user's Claude plan instead of a budget, through `AskUserQuestion`, naming the current plan when the section records one. Offer `Pro ($20)`, `Max 5x ($100)`, `Max 20x ($200)`, and `API or other`. Say that pstack fans out many subagents, so a smaller plan hits its usage limits sooner.
- Step 3 (b) builds the working table from that plan's column of the Plans table. On a re-run, keep any role the user changed by hand. For `API or other`, ask upstream's budget question and apply it to the Max 20x column, as upstream applies it to its defaults.
- Step 5 writes or replaces only the `## pstack model configuration` section of `~/.claude/CLAUDE.md`, and keeps the rest of the file. Write a `# plan: <plan>` line, or for `API or other` the `# budget` line, then the role lines, with no `.mdc` frontmatter.

The plugin installs `pstack:poteto-agent` and `pstack:comment-sicko` itself, so there is nothing to register.

## Other Cursor features

| Cursor | Claude Code |
|---|---|
| `AskQuestion` | `AskUserQuestion` |
| `create-skill` built-in | `plugin-dev:skill-development` when installed, else `skill-creator` |
| A skill from `cursor-team-kit`, such as `deslop`, `control-cli`, or `control-ui` | `/cursor-team-kit:<name>`, from the plugin of that name in this marketplace. Without it, use a same-named installed skill. Without either, strip slop from the diff yourself, or drive the surface directly through Bash or a browser tool. |
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
