# @kivlor/pi-memory

Agent Memory Repo for pi — git-backed cross-session memory following [Cognition's Agent Memory Repo spec](https://github.com/AgentMemoryRepo/agentmemoryrepo).

## Install

```bash
pi install npm:@kivlor/pi-memory
```

`--local`/`-l` writes the declaration to the project's `.pi/settings.json`
instead of the personal one. Manage installed extensions with `pi config`.

## What it does

Persists preferences, decisions, and context across sessions using a local git repo:

- `~/.pi/memory/` — memory repository (override with `PI_MEMORY_DIR`)
- `MEMORY.md` — entry point, appended on each save
- `[[link]]` cross-links to topic files
- Auto git commits after every edit

## Tools

| Tool | Description |
|------|-------------|
| `memory_init` | Initialize or open the memory repo. Run once when memory tools are first needed. |
| `memory_search "<pattern>"` | Regex search across all `.md` files in the repo. |
| `memory_read "[[link]]"` | Read a file by path (omit `.md` for markdown). |
| `memory_save "<entry>"` | Append/update an entry. Auto-stamps `added:` date and `source:` session id. |

## Session Start

On session start, `MEMORY.md` content is injected as a steer message — no user invocation needed. The model automatically has access to past preferences and decisions.

## Command

```
/memory
```

Shows repo path, file count, entry count, git status, and last commit.

## Example Usage

```text
# Save a preference
memory_save "User prefers dark mode for all editors"

# Update a preference
memory_save "User prefers light mode for presentations" oldText: "User prefers dark mode"

# Search for preferences
memory_search "prefers"

# Read a topic file
memory_read "[[preferences]]"
```

## Configuration

- `PI_MEMORY_DIR` — Override memory repo location (default: `~/.pi/memory`)

## Spec Compliance

- Entry point: `MEMORY.md`
- One-line bullet entries with optional `[source: …; added: …]` metadata
- Cross-links: `[[path]]` syntax, `.md` omitted for markdown files
- Auto-commit: `git add -A && git commit` after every edit

## License

MIT
