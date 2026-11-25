/**
 * The `subagent` tool — runs a task in a fresh, throwaway child session
 * (in-memory, no persisted session file) and returns the child's final answer.
 */

import { Type } from "@earendil-works/pi-ai";
import type { Model } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  ModelRuntime,
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

/**
 * Cached ModelRuntime shared by all subagent sessions. Uses the same defaults
 * as createAgentSession (agentDir auth.json / models.json), so model resolution
 * matches what a child session would see.
 */
let modelRuntimePromise: Promise<ModelRuntime> | undefined;

function getModelRuntime(): Promise<ModelRuntime> {
  modelRuntimePromise ??= ModelRuntime.create({ refreshOnCreate: false });
  return modelRuntimePromise;
}

/**
 * Resolve a user-supplied model spec ("provider/model-id", or a bare model id
 * matched across providers, preferring ones with configured auth) to a Model
 * object. createAgentSession takes a Model object, not a string.
 */
async function resolveModelSpec(
  spec: string,
  runtime: ModelRuntime,
): Promise<Model<any> | undefined> {
  const slash = spec.indexOf("/");
  const candidates =
    slash > 0
      ? [runtime.getModel(spec.slice(0, slash), spec.slice(slash + 1))].filter(
          (m): m is Model<any> => m !== undefined,
        )
      : runtime.getModels().filter((m) => m.id === spec);
  if (candidates.length === 0) {
    throw new Error(
      `Unknown model "${spec}". Use a "provider/model-id" string, e.g. "zai/glm-4.7".`,
    );
  }
  return (
    candidates.find((m) => runtime.hasConfiguredAuth(m.provider)) ?? candidates[0]
  );
}

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
        description:
          'Model for the subagent as "provider/model-id" (e.g. "zai/glm-4.7"). ' +
          "Use this to delegate bounded work to a cheaper or faster model; " +
          "omit to inherit the session default.",
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

    const modelRuntime = await getModelRuntime();
    const modelSpec = model || definition?.model;
    const childModel = modelSpec
      ? await resolveModelSpec(modelSpec, modelRuntime)
      : undefined;
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
      modelRuntime,
      ...(childModel ? { model: childModel } : {}),
      thinkingLevel,
      ...(childTools ? { tools: childTools } : {}),
    });

    const unsubscribe = session.subscribe((event) => {
      status.handleEvent(event);
      emitter.maybeRender(status);
    });

    // PromptOptions has no signal field — forward cancellation to the child
    // session directly so aborting the tool call stops the subagent.
    if (signal) {
      signal.addEventListener(
        "abort",
        () => void session.abort(),
        { once: true },
      );
    }

    const promptParts: string[] = [];
    if (definition?.systemPrompt) {
      promptParts.push(
        `# Your role\n\n${definition.systemPrompt}\n\n# Task\n\n${task}`,
      );
    } else {
      promptParts.push(task);
    }

    try {
      await session.prompt(promptParts.join("\n\n"));
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
        details: {
          agent: definition?.name ?? "default",
          ...(childModel ? { model: `${childModel.provider}/${childModel.id}` } : {}),
          task,
        },
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