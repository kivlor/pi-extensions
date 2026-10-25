# pi-extensions

A suite of extensions for the [pi coding agent](https://github.com/earendil-works/pi).

Each extension is a self-contained package of raw TypeScript that pi loads
directly — no build step or compiled artifacts.

## Extensions

| Extension | What it does |
|---|---|
| [`subagents`](extensions/subagents/) | `subagent` tool (fresh in-memory child session) + Codex-style markdown custom agents (`/agents`) |
| [`websearch`](extensions/websearch/) | Exa-backed `web_search` + `web_fetch` tools (`/websearch` status command) |
| [`goal`](extensions/goal/) | `/goal` autonomous goal loop — set/pause/resume/clear long-running objectives with token budgets (simplified port of pi-goal) |
| [`clarify`](extensions/clarify/) | `ask_user` tool — ask the user one focused question and wait (TUI + RPC/Paseo safe) |
| [`memory`](extensions/memory/) | Agent Memory Repo — git-backed cross-session memory (`memory_init/search/read/save`, `/memory` status, session-start injection) |
| [`multiplexer`](extensions/multiplexer/) | Virtual models that rotate through provider variants on failure — automatic failover between providers offering the same model |
| [`shortcodes`](extensions/shortcodes/) | Converts Slack-style `:emoji:` shortcodes to Unicode emoji on message submit |
| [`guard`](extensions/guard/) | Safety oversight for AI agents — think through responses and guard tool calls until user approval |

## Install

```bash
pi install npm:@kivlor/pi-subagents
pi install npm:@kivlor/pi-websearch
pi install npm:@kivlor/pi-goal
pi install npm:@kivlor/pi-clarify
pi install npm:@kivlor/pi-memory
pi install npm:@kivlor/pi-multiplexer
pi install npm:@kivlor/pi-shortcodes
pi install npm:@kivlor/pi-guard
```

`--local`/`-l` writes the declaration to the project's `.pi/settings.json`
instead of the personal one. Manage installed extensions with `pi config`.
