# @kivlor/pi-checkpoint

Checkpoint agents for the Pi coding agent: run a task in a fork of the current
session — the fork starts with the exact same context, not a summary of it.

## Install

```bash
pi install npm:@kivlor/pi-checkpoint
```

`--local`/`-l` writes the declaration to the project's `.pi/settings.json`
instead of the personal one. Manage installed extensions with `pi config`.

## Tools

- **`checkpoint`** — forks this session's full branch into an in-memory child
  session (same model, thinking level and tools) and has it run a task.
  Params: `task`, `model?`.

## Usage

Ask pi: *"Use a checkpoint agent to draft the migration based on what we
discussed"*, and the model calls:

```json
{ "task": "Draft the migration now." }
```

Unlike a subagent, the checkpoint agent needs no briefing — it already holds
this conversation's entire context, including every tool result. See
[PLAN.md](PLAN.md) for the design rationale and roadmap.
