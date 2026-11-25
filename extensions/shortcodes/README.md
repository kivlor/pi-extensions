# @kivlor/pi-shortcodes

Converts Slack-style emoji shortcodes (`:smile:`, `:thumbsup:`, `:tada:`) to
Unicode emoji when a message is submitted.

## Install

```bash
pi install npm:@kivlor/pi-shortcodes
```

`--local`/`-l` writes the declaration to the project's `.pi/settings.json`
instead of the personal one. Manage installed extensions with `pi config`.

## What it does

Subscribes to the `input` event and returns the `transform` action with the
rewritten text, so every known `:shortcode:` in a submitted message is
replaced with its emoji before the prompt reaches the agent:

- `ship it :rocket:` becomes `ship it 🚀`
- `LGTM :white_check_mark:` becomes `LGTM ✅`
- `:smile::fire:` becomes `😄🔥`

The shortcode map (1914 entries) is generated from
[github/gemoji](https://github.com/github/gemoji), sorted by shortcode, plus
a few Slack-specific aliases gemoji lacks (`:thinking_face:`). It covers
everything Slack's standard set uses, including `:+1:`/`:-1:`, `:t-rex:`,
`:e-mail:`, and `:non-potable_water:`.

Unknown shortcodes are left untouched, so custom workspace emoji, timestamps
like `12:30:`, URLs, and plain prose pass through unchanged. The handler
returns `continue` (no-op) when nothing matches, and `transform` chains
correctly with other `input` handlers.

Works for every input source — interactive TUI, RPC (Paseo), and
extension-sent messages.

## Usage

Install it and forget it. There are no commands, tools, or configuration.

## Project-local alternative

The implementation is two files (`src/index.ts` and the generated
`src/shortcodes.ts`). To use it in a single project without installing the
package, copy the `src/` directory to `<project>/.pi/extensions/shortcodes/`.

No state, no I/O, no subprocesses, no dependencies beyond pi's own packages.
