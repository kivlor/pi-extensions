# @kivlor/pi-ask-user

`ask_user` tool for the Pi coding agent: ask the user one focused question
and wait for the answer.

## Install

```bash
pi install npm:@kivlor/pi-ask-user
```

`--local`/`-l` writes the declaration to the project's `.pi/settings.json`
instead of the personal one. Manage installed extensions with `pi config`.

## What it does

Registers an `ask_user` tool the model can call when a decision genuinely
needs the user's input:

- With `options`: shows a selection dialog (`ctx.ui.select`).
- Without `options`: shows a free-form input dialog (`ctx.ui.input`).
- With `allowOther` (default true when options are given): appends an
  `Other…` choice that falls through to a free-form input.
- Returns the answer to the model as ordinary tool output. Cancellation
  (Esc, or a `cancelled` RPC response) returns a concise "user did not
  answer" result instead of throwing.

The tool description and system-prompt guidelines steer the model toward
asking one decision at a time, preferring concrete options, and not asking
about things it can determine itself.

## RPC / Paseo safe

Only the standard extension dialogs are used, which work in the TUI and are
forwarded through the RPC extension UI protocol. Nothing is gated on
`ctx.mode === "tui"` and `ctx.ui.custom()` is never called, so the tool
works from Paseo and other RPC clients. In `json`/`print` modes (no
dialog-capable UI) the tool returns immediately instead of blocking.

## Project-local alternative

The whole implementation is one file. To use it in a single project without
installing the package, copy `src/index.ts` to `<project>/.pi/extensions/ask-user.ts`.

No state, no I/O, no subprocesses, no dependencies beyond pi's own packages.
