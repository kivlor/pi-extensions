# pi-goal

Persistent autonomous goals for the [pi coding agent](https://github.com/earendil-works/pi) — a simplified port of [Michaelliv/pi-goal](https://github.com/Michaelliv/pi-goal).

`/goal` keeps Pi working toward a long-running, thread-scoped objective until the
model marks it complete, the user pauses/clears it, or a token budget runs out.

## Usage

```
/goal improve benchmark coverage until the suite has strong evidence
/goal --tokens 50k finish the migration and verify tests
/goal              # status
/goal pause        # stop autonomous continuation
/goal resume       # reactivate a paused goal
/goal clear        # remove the goal
```

## What it adds

- `create_goal` / `get_goal` / `update_goal` tools (get/update only exposed while a goal is active)
- Token/time accounting per turn, with `--tokens` budget limiting
- Goal state persisted as pi custom session entries — survives reloads (paused), follows the active branch
- Footer status: `Pursuing goal`, `Goal paused`, `Goal achieved`, `Goal unmet`

## Install

```bash
pi install @kivlor/pi-goal
```

or from a local checkout:

```bash
pi install ./extensions/goal
```