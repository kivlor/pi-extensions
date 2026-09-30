# pi-subagents

Subagent delegation for the [pi coding agent](https://github.com/earendil-works/pi) — pure TypeScript, no build step.

## What it adds

- **`subagent` tool** — runs a task in a fresh, throwaway child session (in-memory, no persisted session file) with its own clean context, and returns the child's final answer. Params: `task`, `agent?`, `model?`, `cwd?`.
- **Custom agents, Codex-style** — plain markdown files with YAML frontmatter, discovered from:
  1. `.pi/agents/` in the current project
  2. `~/.pi/agent/agents/`
- **`/agents`** — list agents · `/agents <name>` — inspect one · `/agents:new <name>` — scaffold one.

## Agent file format

```markdown
---
description: Reviews code for bugs and security issues
model: anthropic/claude-sonnet-4.5
thinking: high
tools: ["read", "bash", "grep"]
---

You are a meticulous code reviewer. … (this body is the agent's system prompt)
```

All frontmatter fields are optional. The filename (minus `.md`) is the agent name unless overridden by `name:`.

## Install

```bash
pi install ~/Code/pi-extensions/extensions/subagents
```

## Usage

Ask pi: *"Use a subagent with the code-reviewer agent to review src/foo.ts"*, and the model calls:

```json
{ "task": "Review src/foo.ts ...", "agent": "code-reviewer" }
```

## Not included

Async/background runs, supervisor channels, and scripted multi-agent workflows — this extension covers the common single-task delegation case only.
