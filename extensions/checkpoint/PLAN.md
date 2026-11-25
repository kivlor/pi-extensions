# PLAN — @kivlor/pi-checkpoint

Checkpoint agents: fork the session instead of summarizing it.

Source: the "subagents are the biggest cause of AI failures" thesis —
hand-written summaries between main agent and subagent are lossy, the
subagent fills gaps with assumptions, and its result comes back as another
lossy summary. Same failure mode as compaction. A checkpoint agent instead
forks the session *at the current point*, so its context is byte-identical
to the parent's: it "does exactly what the main agent would have done".

## Why pi is a good fit

Everything the core mechanism needs is already exposed:

| Need | pi primitive |
|---|---|
| Parent's full context | `ctx.sessionManager.getBranch()` — every entry on the active path, incl. tool results and custom entries |
| Seed a child from it | `SessionManager.inMemory(cwd, options, entries)` — in-memory, no session file |
| Same model / thinking | `ctx.model`, `ctx.thinkingLevel` |
| Run the task | `createAgentSession(...)` → `session.prompt(task, { signal })` |
| Progress in the TUI | port `live-status.ts` from `extensions/subagents` |
| Cache telemetry | provider usage on the child's requests (cache-read vs input tokens); pi even has a `cache_warming_decision` event |

## What's in the skeleton

- `src/checkpoint.ts` — `checkpoint` tool: fork branch → in-memory child →
  prompt with the task → return final text + details (forked entries, model).
- `src/index.ts` — registers the tool.
- Live status streaming, usage accounting, commands: not yet.

## Implementation plan

1. **Make the fork faithful (the hard part).**
   The value proposition only holds if the child's first request matches the
   parent's serialized prefix byte-for-byte:
   - system prompt parity: same AGENTS.md, prompt sections, skills hint.
     Compare `ctx.getSystemPrompt()` against what the child builds; if they
     diverge, pass the parent's prompt options or a matching resource loader.
   - tool parity: same active tools/declarations. `createAgentSession` uses
     the default loader, so the child re-discovers extensions. Smoke-tested:
     the child does not re-register this extension (CLI `--extension` flags
     are not inherited), so recursion isn't a risk today — but project-level
     installed extensions may behave differently; verify.
   - branch hygiene: the last entry may be the in-flight tool call itself;
     verify the child replays cleanly (no partial/duplicate entries).
   - model mismatch: a cache hit requires the same model; if the parent
     switched models mid-session the old prefix is worthless — detect and warn.
2. **Usage + telemetry.** Roll child usage into the tool result (docs:
   nested model calls must include usage so session totals stay accurate).
   Record per-run stats: wall time, cost, input vs cache-read tokens, entries
   forked. Add a `/checkpoint` command printing recent runs — the basis for
   comparing against `pi-subagents` with the tweet's methodology.
3. **Live status.** Port `live-status.ts` + throttled emitter from subagents.
4. **Safety valve.** A fork has *full authority* — it read everything, so it
   can also act on everything (the email/purchase failure mode inverted).
   Options to riff on: default allowlist (read-only) with `full: true` opt-in,
   or a `tool_call` gate that confirms side effects outside the task scope.
5. **Riff candidates** (unordered, not committed):
   - **Serial-with-retrieval mode**: child doesn't report back a summary; the
     parent retrieves the child's full transcript on demand (the tweet's
     "long running agent that can retrieve from previous sessions").
   - **Fan-out**: `checkpoint` accepts an array of tasks → N forks over the
     same warm prefix (parallel over identical context, cheap first calls).
   - **Orchestrator mode**: a mode where the main agent gets read-only tools
     + `checkpoint` only — the "super-agent that orchestrates and does no work".
   - **Auto-checkpoint on delegation**: intercept `subagent` calls and offer
     a fork instead.

## Open questions

- Name: `checkpoint`? `fork`? `spawn`?
- Should the child be *forbidden* from calling `checkpoint` (flat hierarchy,
  per the tweet's "no worker delegating to workers" stance) or allowed one level?
- Do we want persistence (a session file for the fork) for auditability, or
  strictly in-memory like subagents?
- Is prefix identity verifiable cheaply? (Hash the serialized request the
  child builds and compare with the parent's last request — needs a hook on
  `before_provider_request` in both sessions.)
- First smoke test passed end-to-end (`pi -p --extension ./extensions/checkpoint`):
  the fork read a file the parent never opened and reported back. The child
  ran without the `checkpoint` tool — acceptable for v1, revisit if we want
  nested fan-out.
