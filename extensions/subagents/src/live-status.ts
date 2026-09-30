/**
 * In-memory live status for a running subagent — Codex-style activity feed.
 *
 * Subscribes to the child session's event stream (no files, no extra session
 * artifacts) and renders a compact rolling view of what the child is doing,
 * pushed to the parent TUI through the tool's `onUpdate` callback.
 */

import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

const MAX_ACTIVITY_LINES = 6;
const MAX_ARG_SUMMARY = 60;
const MAX_THOUGHT_SNIPPET = 80;

/** One-line summary of a tool call's args, e.g. `bash: rg -n foo`. */
function summarizeArgs(toolName: string, args: any): string {
  if (!args || typeof args !== "object") return "";
  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const value = args[key];
      if (typeof value === "string" && value) return value;
    }
    return "";
  };
  switch (toolName) {
    case "bash":
    case "read":
    case "write":
    case "ls":
    case "transcribe_file":
      return pick("command", "path");
    case "edit":
      return pick("path");
    case "grep":
    case "find":
      return pick("pattern", "query", "path");
    case "codemode":
      return "script";
    default: {
      const first = Object.values(args).find(
        (v) => typeof v === "string" && v,
      ) as string | undefined;
      return first ?? "";
    }
  }
}

function truncate(text: string, max: number): string {
  const firstLine = text.split("\n", 1)[0].trim();
  return firstLine.length > max
    ? `${firstLine.slice(0, max - 1)}…`
    : firstLine;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

interface RunningTool {
  toolCallId: string;
  name: string;
  summary: string;
  startedAt: number;
}

export interface LiveStatus {
  /** Feed a session event into the status tracker. */
  handleEvent(event: AgentSessionEvent): void;
  /** Render the current status block as text. */
  render(): string;
  /** Mark finished; subsequent renders show the terminal state. */
  finish(error?: unknown): void;
}

export function createLiveStatus(label: string): LiveStatus {
  const startedAt = Date.now();
  let finished = false;
  let error: unknown;
  /** Completed tool interactions, oldest first, capped for display. */
  const activity: string[] = [];
  let totalToolCount = 0;
  const running = new Map<string, RunningTool>();
  let currentThought = "";

  function noteTool(summary: string, isError: boolean): void {
    if (activity.length >= MAX_ACTIVITY_LINES) activity.shift();
    activity.push(isError ? `${summary} ✗` : summary);
  }

  function fullSummary(name: string, args: any): string {
    const argSummary = summarizeArgs(name, args);
    return truncate(
      `${name}${argSummary ? `: ${argSummary}` : ""}`,
      MAX_ARG_SUMMARY + 40,
    );
  }

  function render(): string {
    const name = label ? `Subagent ${label}` : "Subagent";
    const header = finished
      ? error
        ? `${name} — failed (${formatDuration(Date.now() - startedAt)})`
        : `${name} — finished (${formatDuration(Date.now() - startedAt)}, ${totalToolCount} tool ${totalToolCount === 1 ? "interaction" : "interactions"})`
      : `${name} — working (${formatDuration(Date.now() - startedAt)})`;

    const lines: string[] = [header];
    for (const entry of activity) lines.push(`• ${entry}`);
    if (!finished) {
      for (const tool of running.values()) {
        lines.push(
          `• running ${tool.name} (${formatDuration(Date.now() - tool.startedAt)})` +
            (tool.summary ? ` — ${tool.summary}` : ""),
        );
      }
      if (currentThought) {
        lines.push(`… ${currentThought}`);
      }
      if (activity.length === 0 && running.size === 0 && !currentThought) {
        lines.push("• starting…");
      }
    } else if (error) {
      const message = error instanceof Error ? error.message : String(error);
      lines.push(`Error: ${truncate(message, 200)}`);
    }
    return lines.join("\n");
  }

  function handleEvent(event: AgentSessionEvent): void {
    if (finished) return;
    switch (event.type) {
      case "tool_execution_start": {
        running.set(event.toolCallId, {
          toolCallId: event.toolCallId,
          name: event.toolName,
          summary: fullSummary(event.toolName, event.args),
          startedAt: Date.now(),
        });
        break;
      }
      case "tool_execution_end": {
        // End events carry `result`, not `args` — reuse the summary captured at start.
        const entry = running.get(event.toolCallId);
        running.delete(event.toolCallId);
        totalToolCount += 1;
        noteTool(entry?.summary ?? event.toolName, event.isError);
        break;
      }
      case "message_update": {
        // Keep only the latest snippet of assistant text/thinking; the partial
        // payload is big, so extract just a short tail (pi-subagents' trick of
        // dropping `partial` applies to persisted projection — here we read it).
        const delta = (event as any).assistantMessageEvent?.partial;
        if (typeof delta === "string" && delta.trim()) {
          currentThought = truncate(delta, MAX_THOUGHT_SNIPPET);
        }
        break;
      }
      case "message_end": {
        // A completed assistant message often carries the reasoning text.
        const message = (event as any).message;
        if (message?.role === "assistant") {
          const content = Array.isArray(message.content) ? message.content : [];
          for (const block of content) {
            if (block?.type === "text" && block.text?.trim()) {
              currentThought = truncate(block.text, MAX_THOUGHT_SNIPPET);
            }
          }
        }
        break;
      }
      default:
        break;
    }
  }

  function finish(err?: unknown): void {
    finished = true;
    error = err;
    running.clear();
  }

  return { handleEvent, render, finish };
}

/**
 * Throttle wrapper: forwards renders to `emit` at most every `intervalMs`,
 * except the first render and any explicitly-flushed final render.
 */
export function createThrottledEmitter(
  emit: (text: string) => void,
  intervalMs = 1000,
): { maybeRender(status: LiveStatus): void; flush(status: LiveStatus): void } {
  let last = 0;
  return {
    maybeRender(status: LiveStatus): void {
      const now = Date.now();
      if (now - last >= intervalMs) {
        last = now;
        emit(status.render());
      }
    },
    flush(status: LiveStatus): void {
      last = Date.now();
      emit(status.render());
    },
  };
}
