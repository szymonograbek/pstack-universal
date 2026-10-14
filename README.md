<img src="assets/icon.svg" width="64" height="64" alt="">

# pstack-universal

[poteto's pstack](https://github.com/cursor/plugins/tree/main/pstack) for Claude Code and Codex, kept as close to upstream as the two harnesses allow. It ships with [cursor-team-kit](https://github.com/cursor/plugins/tree/main/cursor-team-kit), whose `deslop`, `control-ui`, and `control-cli` skills pstack calls.

The skills, playbooks, and agent prompts are upstream's files. Each harness gets one runtime file that maps Cursor's tools, models, and paths to its own. A session hook keeps an invoked Poteto Mode active across compaction and resume.

## Install

### Claude Code

```sh
/plugin marketplace add szymonograbek/pstack-universal
/plugin install pstack@pstack-universal
/plugin install cursor-team-kit@pstack-universal
```

The plugins install their custom agents: `pstack:poteto-agent`, `pstack:comment-sicko`, `cursor-team-kit:ci-watcher`, and `cursor-team-kit:thermo-nuclear-code-quality-review`. Run `/pstack:setup-pstack` to choose a model per role. It asks for your Claude plan (Pro, Max 5x, or Max 20x) and starts from that plan's defaults in [`runtime/claude-code.md`](plugins/pstack/runtime/claude-code.md). Upstream assumes unlimited inference and runs every role at `xhigh`, which only Max 20x keeps. Without setup, pstack uses the Max 5x defaults. If another pstack port is installed, disable it first. Both register as `pstack`.

### Codex

```sh
codex plugin marketplace add szymonograbek/pstack-universal
codex plugin add pstack@pstack-universal
codex plugin add cursor-team-kit@pstack-universal
```

In a new session, trust the two pstack hooks in Codex's hook controls. Then run `$pstack:setup-pstack` with a persistent clone of this repository. It writes the model section and registers both plugins' agents in `~/.codex/config.toml`. Codex plugins cannot ship agents, so this registration step is required. If an older port registered those agents, setup names the old path and asks before replacing it.

## Use

Start Poteto Mode with `/poteto-mode` at the start of a Claude Code prompt, or `$poteto-mode` anywhere in a Codex prompt. The hook replies with an activation receipt. From then on it re-injects the mode on every prompt and after every compaction or resume, for that session in that directory only. `disable /poteto-mode` or `disable $poteto-mode` turns it off.

As upstream intends, every pstack skill except `setup-pstack` runs only when invoked. Most cursor-team-kit skills can also be picked by the model, as upstream ships them. Claude Code reads `disable-model-invocation` from each `SKILL.md`. Codex reads the generated `agents/openai.yaml` next to it. There is no session-start router.

## Differences from upstream

`npm run sync:status` lists every upstream file this port changes. The changes are these:

- 21 skills that name Cursor tools get one line under their heading, 19 in pstack and 2 in cursor-team-kit. It points to [`runtime/claude-code.md`](plugins/pstack/runtime/claude-code.md) or [`runtime/codex.md`](plugins/pstack/runtime/codex.md).
- `poteto-agent.md` searches the Claude Code and Codex plugin caches as well as `~/.cursor/plugins/`, and reads the runtime file.
- `poteto-mode` and `make-bot-ui` use their directory name as the frontmatter `name`. Codex takes the skill name from that field.
- `ci-watcher.md` uses `model: haiku` instead of Cursor's `model: fast`, which the Anthropic API rejects.

Everything else is new and outside upstream's paths: the manifests, [`hooks/`](plugins/pstack/hooks), [`runtime/`](plugins/pstack/runtime) and its copy in cursor-team-kit, the generated `codex/agents/*.toml` and `skills/*/agents/openai.yaml`, and the Codex agent installer in `setup-pstack/scripts/`.

Not ported:

- Benny (`automations/benny`) depends on Cursor Automations and is included only as upstream ships it.
- cursor-team-kit's `rules/*.mdc` are always-applied Cursor rules. Neither harness has plugin rules, so they are left out.
- Cursor cloud agents run locally in a worktree instead.
- Model panels that upstream spreads across vendors stay within one vendor per harness. The runtime files tell the agent to say so.

## Update from upstream

```sh
npm run sync          # three-way merge of upstream main into every plugin
npm run build         # add missing runtime pointers, regenerate the derived files
npm run check && npm test
```

`sync` merges each file using the recorded upstream revision as the base. Files we did not change take upstream's version. Our edits are kept, and overlapping edits get conflict markers. When an upstream plugin's version changes, bump `version` in both of its manifests.

## Credits

pstack is by Lauren Tan and cursor-team-kit by Eric Zakariasson, both MIT licensed. See [`plugins/pstack/LICENSE`](plugins/pstack/LICENSE) and [`plugins/cursor-team-kit/LICENSE`](plugins/cursor-team-kit/LICENSE). The Codex hook and agent installer started in [codex-pstack](https://github.com/szymonograbek/codex-pstack).
