# pi-extensions

A suite of extensions for the [pi coding agent](https://github.com/earendil-works/pi).

Each extension is a self-contained package of raw TypeScript that pi loads
directly — no build step or compiled artifacts.

## Extensions

| Extension | What it does |
|---|---|
| [`subagents`](extensions/subagents/) | `subagent` tool (fresh in-memory child session) + Codex-style markdown custom agents (`/agents`) |
| [`web-search`](extensions/web-search/) | Exa-backed `web_search` + `web_fetch` tools (`/websearch` status command) |

## Install

Install an extension by path — pi loads it in place:

```bash
pi install ~/Code/pi-extensions/extensions/<name>
```

`--local`/`-l` writes the declaration to the project's `.pi/settings.json`
instead of the personal one. Manage installed extensions with `pi config`.

## Adding a new extension

1. Create `extensions/<name>/` with a `package.json` containing
   `"pi": { "extensions": ["./index.ts"] }` and peer dependencies on
   `@earendil-works/pi-coding-agent` (+ `pi-ai` if you use `Type`)
2. Add an `index.ts` barrel exporting a default extension factory:
   `export default function (pi: ExtensionAPI) { … }`

Conventions:

- The factory stays registration-only; lazy-load feature code from commands,
  tools, and `session_start` — pi may evaluate the module without a session
- No processes, sockets, watchers, or timers in the factory
- Ship raw TS; declare host packages (`pi-coding-agent`, `pi-tui`, `pi-ai`)
  in `peerDependencies` only — never bundle them
- Dev-loop a single extension without touching settings:
  `pi -ne --extension extensions/<name>/index.ts -p "..."`
  (`-ne` disables installed packages to avoid tool-name conflicts)

To share one: `npm publish` from its directory — the `files` list ships the
raw TypeScript, which pi loads natively.
