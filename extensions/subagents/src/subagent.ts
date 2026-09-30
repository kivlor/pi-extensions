/**
 * The `subagent` tool — runs a task in a fresh, throwaway child session
 * (in-memory, no persisted session file) and returns the child's final answer.
 */

import { Type } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  SessionManager,
  defineTool,
  type AgentToolUpdateCallback,
} from "@earendil-works/pi-coding-agent";
import type { AgentDefinition } from "./agents.ts";
import {
  createLiveStatus,
  createThrottledEmitter,
} from "./live-status.ts";

const MAX_RESULT_CHARS = 60_000;

export const subagentTool = defineTool({
  name: "subagent",
  label: "Subagent",
  description:
    "Run a task in an isolated subagent with a fresh context and its own tools. " +
    "The subagent cannot see this conversation; include everything it needs in the task. " +
    "Use a named custom agent to give it a specialized system prompt, model, or tool allowlist.",
  parameters: Type.Object({
    task: Type.String({
      description: "Complete, self-contained instructions for the subagent.",
    }),
    agent: Type.Optional(
      Type.String({
        description:
          "Name of a custom agent (from .pi/agents/ or ~/.pi/agent/agents/) to use. " +
          "Omit for a generic agent with default tools.",
      }),
    ),
    model: Type.Optional(
      Type.String({
        description: "Model override for the subagent, e.g. z-ai/glm-5.3.",
      }),
    ),
    cwd: Type.Optional(
      Type.String({
        description:
          "Working directory for the subagent. Defaults to the current working directory.",
      }),
    ),
  }),

  async execute(toolCallId, params, signal, onUpdate: AgentToolUpdateCallback<unknown>) {
    const { task, agent, model, cwd } = params;

    let definition: AgentDefinition | undefined;
    if (agent) {
      const { findAgent } = await import("./agents.ts");
      definition = findAgent(agent);
      if (!definition) {
        throw new Error(
          `Unknown agent "${agent}". Available agents are listed by the /agents command.`,
        );
      }
    }

    const childModel = model || definition?.model;
    const thinkingLevel = (definition?.thinking as "low" | "medium" | "high" | undefined) ?? "low";

    const label = definition ? `"${definition.name}"` : "";
    const status = createLiveStatus(label);
    const emitter = createThrottledEmitter((text) =>
      onUpdate({ content: [{ type: "text", text }], details: {} }),
    );
    emitter.flush(status);

    // pi registers MCP tools (mcp__<server>__<tool>) with default exposure "codemode":
    // they are only callable through the codemode tool. When an agent's tool list
    // references MCP tools, make sure codemode is enabled in the child session or
    // the MCP tools exist but are unreachable.
    const requestedTools = definition?.tools;
    const childTools =
      requestedTools && requestedTools.some((t) => t.startsWith("mcp__"))
        ? [...new Set(["codemode", ...requestedTools])]
        : requestedTools;

    const { session } = await createAgentSession({
      sessionManager: SessionManager.inMemory(),
      cwd: cwd || process.cwd(),
      ...(childModel ? { model: childModel } : {}),
      thinkingLevel,
      ...(childTools ? { tools: childTools } : {}),
    });

    const unsubscribe = session.subscribe((event) => {
      status.handleEvent(event);
      emitter.maybeRender(status);
    });

    const promptParts: string[] = [];
    if (definition?.systemPrompt) {
      promptParts.push(
        `# Your role\n\n${definition.systemPrompt}\n\n# Task\n\n${task}`,
      );
    } else {
      promptParts.push(task);
    }

    try {
      await session.prompt(promptParts.join("\n\n"), { signal });
      status.finish();
      emitter.flush(status);
      let text = session.getLastAssistantText() ?? "";
      if (text.length > MAX_RESULT_CHARS) {
        text =
          text.slice(0, MAX_RESULT_CHARS) +
          `\n\n[truncated — full output was ${text.length} characters]`;
      }
      return {
        content: [{ type: "text", text: text || "(subagent returned no text)" }],
        details: { agent: definition?.name ?? "default", task },
      };
    } catch (error) {
      status.finish(error);
      emitter.flush(status);
      throw error;
    } finally {
      unsubscribe();
      session.dispose();
    }
  },
});