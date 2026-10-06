/**
 * @kivlor/pi-ask-user — entry point.
 *
 * Registers:
 *   - `ask_user` tool: ask the user one focused question and block until answered
 *
 * Uses only the standard extension dialogs (ctx.ui.select / ctx.ui.input),
 * which work in the TUI and over the RPC extension UI protocol (e.g. Paseo).
 * No state, no I/O, no dependencies beyond pi's own packages.
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { AgentToolResult, ExtensionAPI, ExtensionToolContext } from "@earendil-works/pi-coding-agent";

/** Label of the free-form fallback option appended when allowOther is true. */
const OTHER = "Other…";

/** Structured `details` attached to every ask_user result. */
interface AskUserDetails {
  question: string;
  /** Labels of the offered options; empty for open-ended questions. */
  options: string[];
  /** The user's answer, or null when cancelled/unanswered. */
  answer: string | null;
  /** True when the answer was typed free-form rather than picked from a listed option. */
  wasCustom: boolean;
}

function cancelled(details: AskUserDetails): AgentToolResult<AskUserDetails> {
  return {
    content: [
      {
        type: "text",
        text: "User cancelled and did not answer. Use your best judgment or state your assumption; do not immediately re-ask.",
      },
    ],
    details,
  };
}

/** Free-form question via ctx.ui.input; used when no options are given or "Other…" is chosen. */
async function askFreeForm(
  ctx: ExtensionToolContext,
  question: string,
  base: AskUserDetails,
  signal: AbortSignal | undefined,
): Promise<AgentToolResult<AskUserDetails>> {
  const answer = await ctx.ui.input(question, "Your answer", { signal });
  const trimmed = answer?.trim();
  if (!trimmed) return cancelled(base);
  return {
    content: [{ type: "text", text: `User answered: ${trimmed}` }],
    details: { ...base, answer: trimmed, wasCustom: true },
  };
}

export const askUserTool = defineTool({
  name: "ask_user",
  label: "Ask User",
  description:
    "Ask the user one focused question and wait for their answer. Use when a missing requirement, preference, " +
    "architectural decision, ambiguous choice, or potentially consequential decision materially affects how you " +
    "should proceed. Investigate what you can first; don't ask the user questions you can answer yourself. " +
    "Ask one decision per call — never bundle a questionnaire into one call. Offer concrete options when there " +
    "are a small number of meaningful choices, and include enough context in the question and options for the " +
    "user to decide; omit options for open-ended questions. Do not use this tool for routine, low-risk " +
    "implementation choices you can reasonably make yourself.",
  promptSnippet: "Ask the user one focused question when a genuine decision or missing requirement blocks you.",
  promptGuidelines: [
    "Ask one decision per ask_user call; never bundle multiple questions into one call.",
    "Offer concrete ask_user options when there are a few meaningful choices; include enough context to decide.",
    "Investigate before calling ask_user; skip it for routine low-risk choices you can make yourself.",
  ],
  parameters: Type.Object({
    question: Type.String({ description: "One focused question, with enough context for the user to decide" }),
    options: Type.Optional(
      Type.Array(
        Type.Object({
          label: Type.String({ description: "Short label for the choice" }),
          description: Type.Optional(Type.String({ description: "One line explaining what this choice means" })),
        }),
        { description: "Concrete choices to pick from; omit for open-ended questions", maxItems: 12 },
      ),
    ),
    allowOther: Type.Optional(
      Type.Boolean({
        description: "Append an 'Other…' choice for a free-form answer (default true when options are given)",
      }),
    ),
  }),
  // Declared to the model but not callable from other tools — the intended exposure for ask-the-user tools.
  exposure: "model-only",
  // The user dialog must finish before anything else in the batch runs.
  executionMode: "sequential",
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },

  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    const base: AskUserDetails = {
      question: params.question,
      options: params.options?.map((o) => o.label) ?? [],
      answer: null,
      wasCustom: false,
    };

    // json/print modes have no dialog-capable UI — nobody could ever answer.
    if (!ctx.hasUI) {
      return {
        content: [
          {
            type: "text",
            text: "No interactive UI is available, so the user cannot be asked. Proceed with your best judgment and state your assumption.",
          },
        ],
        details: base,
      };
    }

    const options = (params.options ?? []).filter((o) => o.label.trim().length > 0);
    const allowOther = params.allowOther ?? options.length > 0;

    if (options.length === 0) {
      return await askFreeForm(ctx, params.question, base, signal);
    }

    // ctx.ui.select takes plain strings, so fold each description into its label.
    const display = options.map((o) => (o.description ? `${o.label} — ${o.description}` : o.label));
    if (allowOther) display.push(OTHER);

    const selected = await ctx.ui.select(params.question, display, { signal });
    if (selected === undefined) return cancelled(base);

    if (selected === OTHER) {
      return await askFreeForm(ctx, params.question, base, signal);
    }

    const label = options[display.indexOf(selected)]?.label ?? selected;
    return {
      content: [{ type: "text", text: `User selected: ${label}` }],
      details: { ...base, answer: label },
    };
  },
});

export default function askUser(pi: ExtensionAPI): void {
  pi.registerTool(askUserTool);
}
