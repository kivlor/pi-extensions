# pi-extensions

A personal suite of pi extensions, built the **pi-voice way**: raw TypeScript
loaded directly via jiti — no build step, no `dist/`, no compiled artifacts.
Pi transpiles at load time; the source tree *is* the published artifact.

## Extensions

| Extension | What it does |
|---|---|
| [`subagents`](extensions/subagents/) | `subagent` tool (fresh in-memory child session) + Codex-style markdown custom agents (`/agents`) |

## Layout

```
pi-extensions/
  extensions/
    subagents/
      package.json     # name, pi.extensions: ["./index.ts"], peerDependencies
      index.ts         # barrel: export { default } from "./src/index.ts"
      src/             # all implementation, raw .ts
```

## Install (locally, no npm publish needed)

Install one extension by path — pi loads it in place, no copying:

```bash
pi install ~/Code/pi-extensions/extensions/subagents
```

`--local`/`-l` writes the declaration to the project's `.pi/settings.json`
instead of the personal one. Manage with `pi config`.

Each extension is a self-contained package. New extensions just need:

1. `extensions/<name>/` with a `package.json` containing
   `"pi": { "extensions": ["./index.ts"] }` and peer dependencies on
   `@earendil-works/pi-coding-agent` (+ `pi-ai` if you use `Type`)
2. An `index.ts` barrel exporting a default extension factory
   (`export default function (pi: ExtensionAPI) { … }`)

## Conventions (from pi-voice)

- Factory stays registration-only; lazy-load feature code from commands,
  tools, and `session_start` — pi may evaluate the module without a session
- No processes, sockets, watchers, or timers in the factory
- Ship source; declare host packages (`pi-coding-agent`, `pi-tui`,
  `pi-ai`) in `peerDependencies` only — never bundle them
- Dev-loop a single extension without touching settings:
  `pi -ne --extension extensions/<name>/index.ts -p "..."`
  (`-ne` disables installed packages to avoid tool-name conflicts)

## Publishing

When one is ready to share: `npm publish` from its directory — the `files`
list already ships raw TS, which pi loads natively.
