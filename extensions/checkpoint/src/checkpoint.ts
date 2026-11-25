/**
 * The `checkpoint` tool — "checkpoint agents" à la the lossy-summary critique.
 *
 * Instead of the main agent writing a summary and handing it to a fresh
 * subagent, we fork the parent session's *entire branch* into an in-memory
 * child session. The child's context is identical to the parent's at fork
 * time, so:
 *
 *   - no information is lost to a hand-written summary (no assumptions)
 *   - the child's first model request shares the parent's prefix, so a warm
 *     provider prompt cache should turn most of its input into cache reads
 *
 * The child runs the task with the parent's exact model, thinking level and
 * default tools, and returns its final text plus usage.
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

const MAX_RESULT_CHARS = 60_000;

/**
 * Cached ModelRuntime shared by all checkpoint sessions. Same defaults as
 * createAgentSession (agentDir auth.json / models.json).
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

export const checkpointTool = defineTool({
  name: "checkpoint",
  label: "Checkpoint agent",
  description:
    "Run a task in a checkpoint agent: a fork of THIS session with the exact same context " +
    "(not a summary). The fork sees everything this conversation has seen, then does the " +
    "task and reports back. Prefer this over writing a summary for a subagent when the " +
    "task depends on nuances of this conversation. The fork uses this session's model, " +
    "thinking level and tools.",
  parameters: Type.Object({
    task: Type.String({
      description:
        "The task for the checkpoint agent. Phrase it as an instruction to yourself — " +
        "the agent already has this session's full context.",
    }),
    // TODO(riff): allow a read-only allowlist for exploration-style forks so a
    // checkpoint can scout without side effects the parent didn't ask for.
    model: Type.Optional(
      Type.String({
        description: "Model override. Defaults to this session's model (recommended: keep it — an override loses the shared cache prefix).",
      }),
    ),
  }),

  async execute(toolCallId, params, signal, onUpdate: AgentToolUpdateCallback<unknown>, ctx) {
    const { task, model } = params;

    // 1. Capture the parent's full branch — every entry on the active path,
    //    including tool results and custom entries. This is the "checkpoint".
    //    (ReadonlySessionManager exposes getBranch(); entries are plain data.)
    const branch = ctx.sessionManager.getBranch();
    if (branch.length === 0) {
      throw new Error("No session history to checkpoint — this session is empty.");
    }

    // 2. Seed an in-memory child with the parent's entries. No file is written.
    //    TODO(prefix-identity): the child's serialized request must match the
    //    parent's byte-for-byte up to the fork point for the provider cache to
    //    hit: same system prompt (AGENTS.md, prompt sections), same tool
    //    declarations, same model. createAgentSession rebuilds the system
    //    prompt via its resource loader — verify parity. Observed in the smoke
    //    test: the child does NOT get the `checkpoint` tool registered (the
    //    --extension CLI flag is not re-applied in the child), so recursion is
    //    not a risk today — but re-check if the child loader changes.
    const modelRuntime = await getModelRuntime();
    const childModel = model
      ? await resolveModelSpec(model, modelRuntime)
      : ctx.model;

    const { session: child } = await createAgentSession({
      sessionManager: SessionManager.inMemory(ctx.cwd, undefined, branch),
      cwd: ctx.cwd,
      modelRuntime,
      ...(childModel ? { model: childModel } : {}),
      ...(ctx.thinkingLevel ? { thinkingLevel: ctx.thinkingLevel } : {}),
    });

    // PromptOptions has no signal field — forward cancellation to the child
    // session directly so aborting the tool call stops the checkpoint agent.
    if (signal) {
      signal.addEventListener(
        "abort",
        () => void child.abort(),
        { once: true },
      );
    }

    try {
      // 3. Run the task. The child continues exactly where the parent left off.
      //    TODO(usage): roll the child's token usage into the tool result so
      //    session totals stay accurate.
      await child.prompt(task);

      let text = child.getLastAssistantText() ?? "";
      if (text.length > MAX_RESULT_CHARS) {
        text =
          text.slice(0, MAX_RESULT_CHARS) +
          `\n\n[truncated — full output was ${text.length} characters]`;
      }
      return {
        content: [{ type: "text", text: text || "(checkpoint agent returned no text)" }],
        details: {
          forkedEntries: branch.length,
          model: childModel ? `${childModel.provider}/${childModel.id}` : undefined,
        },
      };
    } finally {
      child.dispose();
    }
  },
});
