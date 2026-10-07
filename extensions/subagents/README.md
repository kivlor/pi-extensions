# @kivlor/pi-subagents

Subagent delegation for the Pi coding agent: run a task in a fresh child
session with its own clean context, optionally guided by a custom agent
defined in a plain markdown file.

## Install

```bash
pi install npm:@kivlor/pi-subagents
```

`--local`/`-l` writes the declaration to the project's `.pi/settings.json`
instead of the personal one. Manage installed extensions with `pi config`.

## Tools

- **`subagent`** — runs a task in a fresh, throwaway child session
  (in-memory, no persisted session file) and returns the child's final
  answer. Params: `task`, `agent?`, `model?`, `cwd?`.

## Usage

Ask pi: *"Use a subagent with the code-reviewer agent to review src/foo.ts"*,
and the model calls:

```json
{ "task": "Review src/foo.ts ...", "agent": "code-reviewer" }
```

## Commands

- **`/agents`** — list agents
- **`/agents <name>`** — inspect one
- **`/agents:new <name>`** — scaffold one

## Custom agents

Plain markdown files with YAML frontmatter, discovered from:

1. `.pi/agents/` in the current project
2. `~/.pi/agent/agents/`

File format:

```markdown
---
description: Reviews code for bugs and security issues
model: z-ai/glm-5.3
thinking: high
tools: ["read", "bash", "grep"]
---

You are a meticulous code reviewer. … (this body is the agent's system prompt)
```

All frontmatter fields are optional. The filename (minus `.md`) is the agent
name unless overridden by `name:`.
