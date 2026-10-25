# @kivlor/pi-guard

Classifier-based safety oversight for AI agents — uses a System One model to
judge whether tool calls need user approval.

## Install

```bash
pi install npm:@kivlor/pi-guard
```

`--local`/`-l` writes the declaration to the project's `.pi/settings.json`
instead of the personal one. Manage installed extensions with `pi config`.

## What it does

Uses a classifier model (Jev, Luna, Clef, etc.) to automatically judge whether
each tool call is:
- **allow** — safe routine action, proceed automatically
- **review** — potentially impactful, needs user confirmation
- **block** — likely harmful, should not proceed

Read-only tools (with `readOnlyHint: true`) are allowed through automatically.
All other tool calls go through the classifier.

## Tools

### `guard_check`

Explicitly check a planned action with the classifier before executing.

**Parameters:**
- `action` (string, required): Description of the action you plan to take
- `context` (string, optional): Additional context about why

Returns the classifier's assessment (allow/review/block) with reasoning.

## Commands

- `/guard-on` — Enable the guard (default)
- `/guard-off` — Disable the guard (allow all tool calls)
- `/guard-status` — Show current guard status
- `/guard-classifier provider/id` — Set classifier model

## Requirements

Needs a configured classifier model. Options:

| Provider | Model ID | Auth |
|---|---|---|
| `typesafe` | `jev-latest` | `TYPESAFE_API_KEY` |
| `openrouter` | `typesafe/jev-1.13` | `OPENROUTER_API_KEY` |
| `openai` | `gpt-6-luna` | `OPENAI_API_KEY` |
| `cloudflare-workers-ai` | `@cf/cloudflare/clef` | `CLOUDFLARE_API_KEY` + `CLOUDFLARE_ACCOUNT_ID` |

Default: `typesafe/jev-latest`

## Example workflow

```
User: Delete the old log files
      [model calls bash with "rm *.log"]
      [GUARD: Classifier says "review" — approve?]
      → User decides
      
User: Read the config file
      [model calls read]
      [read has readOnlyHint: true — allowed through]
      → Proceeds automatically
```

## Safety model

1. **Read-only tools** → Always allowed (no classifier call)
2. **Classifier available** → Judge allow/review/block
3. **Classifier unavailable** → Block non-readonly, require user approval
4. **No interactive UI** → Block non-readonly for safety

The guard cannot be bypassed by the model — only `/guard-off` disables it.
