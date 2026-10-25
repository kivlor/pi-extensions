/**
 * @kivlor/pi-guard — Classifier-based safety oversight for AI agents.
 *
 * Uses a System One classifier (Jev, Luna, etc.) to judge whether tool calls
 * are potentially concerning and require user approval.
 *
 * Flow:
 * 1. `guard_check` tool: Explicitly check a planned action with the classifier
 * 2. `tool_call` handler: Automatically judges every tool call
 * 3. If classifier flags concern → blocks and asks user
 *
 * Requires a classifier model configured (TypeSafe, OpenRouter Jev, GPT-6 Luna, etc.)
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI, type AgentToolResult } from "@earendil-works/pi-coding-agent";

/** Details stored in tool result */
interface GuardCheckDetails {
	action: string;
	reasoning: string;
	decision: "allow" | "review" | "block";
	confidence: number;
	classifierUsed: string;
}

/** Default classifier to use (can be overridden) */
const DEFAULT_CLASSIFIER = { provider: "typesafe", id: "jev-latest" };

/** Classifier questions for judging actions */
const JUDGE_QUESTIONS = {
	decision: {
		type: "choice" as const,
		instructions: "Should this action proceed automatically, or does it need review?",
		criteria: {
			allow: "Safe routine action — file reads, searches, harmless commands",
			review: "Potentially impactful — edits, external calls, resource changes, or uncertain",
			block: "Likely harmful or against user intent — should not proceed",
		},
	},
	confidence: {
		type: "score" as const,
		instructions: "How confident are you in this decision?",
		criteria: ["guessing", "uncertain", "moderately confident", "confident", "very confident"],
	},
};

/** Run classifier judgment */
async function judgeAction(
	action: string,
	context: string,
	classifier: { provider: string; id: string },
	ctx: { modelRegistry: ExtensionAPI["modelRegistry"]; signal?: AbortSignal },
): Promise<{ decision: "allow" | "review" | "block"; confidence: number; reasoning: string } | null> {
	const model = ctx.modelRegistry.findOfType("classifier", classifier.provider, classifier.id);
	if (!model) return null;

	if (!ctx.modelRegistry.hasConfiguredAuth(model)) return null;

	const result = await ctx.modelRegistry.classify(
		model,
		{
			state: { action, context },
			questions: JUDGE_QUESTIONS,
		},
		{ signal: ctx.signal },
	);

	if (result.stopReason !== "stop") return null;

	const decision = result.answers.decision;
	const confidence = result.answers.confidence;

	if (decision.type !== "choice" || confidence.type !== "score") return null;

	return {
		decision: decision.choice as "allow" | "review" | "block",
		confidence: confidence.confidence,
		reasoning: `Classifier chose "${decision.choice}" (confidence: ${confidence.confidence.toFixed(2)}, probabilities: ${JSON.stringify(decision.probabilities)})`,
	};
}

export default function guardExtension(pi: ExtensionAPI): void {
	// Guard settings (could be made configurable)
	let enabled = true;
	let classifier = DEFAULT_CLASSIFIER;
	let autoReviewThreshold = 0.6; // If review probability > this, require approval

	// Reset on session start
	pi.on("session_start", async () => {
		enabled = true;
	});

	// Register the explicit check tool
	const guardCheckTool = defineTool({
		name: "guard_check",
		label: "Guard Check",
		description:
			"Ask the guard classifier whether a planned action is safe to proceed. " +
			"Use this before taking potentially impactful actions to get a safety assessment.",
		promptSnippet: "Use guard_check to verify potentially impactful actions before executing.",
		promptGuidelines: [
			"Call guard_check before actions that modify files, make network calls, or could have side effects.",
			"The classifier returns: 'allow' (safe), 'review' (needs approval), or 'block' (should not proceed).",
		],
		parameters: Type.Object({
			action: Type.String({
				description: "Description of the action you plan to take",
			}),
			context: Type.Optional(
				Type.String({
					description: "Additional context about why you're taking this action",
				}),
			),
		}),
		exposure: "direct",
		annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },

		async execute(_toolCallId, params, signal, _onUpdate, ctx): Promise<AgentToolResult<GuardCheckDetails>> {
			const judgment = await judgeAction(
				params.action,
				params.context ?? "",
				classifier,
				{ modelRegistry: ctx.modelRegistry, signal },
			);

			if (!judgment) {
				return {
					content: [
						{
							type: "text",
							text: "Guard: Classifier not available. Proceed with caution.",
						},
					],
					details: {
						action: params.action,
						reasoning: "Classifier unavailable",
						decision: "review",
						confidence: 0,
						classifierUsed: `${classifier.provider}/${classifier.id}`,
					},
				};
			}

			let responseText = `Guard assessment: **${judgment.decision.toUpperCase()}**\n\n`;
			responseText += judgment.reasoning;

			if (judgment.decision === "review") {
				responseText += "\n\n⚠️ This action requires user review before proceeding.";
			} else if (judgment.decision === "block") {
				responseText += "\n\n🚫 This action should not proceed. Find an alternative approach.";
			} else {
				responseText += "\n\n✅ This action appears safe to proceed.";
			}

			return {
				content: [{ type: "text", text: responseText }],
				details: {
					action: params.action,
					reasoning: judgment.reasoning,
					decision: judgment.decision,
					confidence: judgment.confidence,
					classifierUsed: `${classifier.provider}/${classifier.id}`,
				},
			};
		},
	});

	pi.registerTool(guardCheckTool);

	// Commands
	pi.registerCommand("guard-on", {
		description: "Enable the guard (auto-review tool calls)",
		handler: async (_args, ctx) => {
			enabled = true;
			ctx.ui.notify("Guard enabled — tool calls will be reviewed", "info");
		},
	});

	pi.registerCommand("guard-off", {
		description: "Disable the guard (allow all tool calls)",
		handler: async (_args, ctx) => {
			enabled = false;
			ctx.ui.notify("Guard disabled — tool calls will proceed automatically", "warning");
		},
	});

	pi.registerCommand("guard-status", {
		description: "Show guard status",
		handler: async (_args, ctx) => {
			const status = enabled ? "enabled" : "disabled";
			ctx.ui.notify(`Guard ${status} — using ${classifier.provider}/${classifier.id}`, "info");
		},
	});

	pi.registerCommand("guard-classifier", {
		description: "Set the classifier model (format: provider/id)",
		handler: async (args, ctx) => {
			const parts = args.trim().split("/");
			if (parts.length !== 2) {
				ctx.ui.notify("Usage: /guard-classifier provider/id (e.g. typesafe/jev-latest)", "error");
				return;
			}
			classifier = { provider: parts[0], id: parts[1] };
			ctx.ui.notify(`Guard classifier set to ${classifier.provider}/${classifier.id}`, "info");
		},
	});

	// The guard itself — intercept and judge tool calls
	pi.on("tool_call", async (event, ctx) => {
		// Skip guard for our own tool
		if (event.toolName === "guard_check") {
			return;
		}

		// Guard disabled — allow all
		if (!enabled) {
			return;
		}

		// Build action description for classifier
		const actionDesc = `Tool: ${event.toolName}\nArguments: ${JSON.stringify(event.args, null, 2).slice(0, 2000)}`;

		// Quick check: read-only tools are usually safe
		const toolInfo = pi.getAllTools().find((t) => t.name === event.toolName);
		if (toolInfo?.annotations?.readOnlyHint === true) {
			// Let read-only tools through without classifier call
			return;
		}

		// Run classifier judgment
		const judgment = await judgeAction(actionDesc, "", classifier, {
			modelRegistry: ctx.modelRegistry,
			signal: event.signal,
		});

		// If classifier unavailable, require review for non-readonly
		if (!judgment) {
			if (!ctx.hasUI) {
				return {
					block: true,
					reason: `Guard: Classifier unavailable and "${event.toolName}" is not read-only. Blocked for safety.`,
				};
			}
			const approved = await ctx.ui.confirm(
				`Allow tool call?\n\nTool: ${event.toolName}\n\nClassifier unavailable — blocked by default. Approve?`,
				`Tool: ${event.toolName}`,
			);
			if (approved) return;
			return {
				block: true,
				reason: `Tool call "${event.toolName}" was not approved by user.`,
			};
		}

		// Classifier says allow
		if (judgment.decision === "allow") {
			return;
		}

		// Classifier says block
		if (judgment.decision === "block") {
			return {
				block: true,
				reason: `Guard blocked "${event.toolName}": ${judgment.reasoning}`,
			};
		}

		// Classifier says review — ask user
		if (!ctx.hasUI) {
			return {
				block: true,
				reason: `Guard requires review for "${event.toolName}" but no interactive UI available.`,
			};
		}

		const approved = await ctx.ui.confirm(
			`Guard requests review for:\n\nTool: ${event.toolName}\n\n${judgment.reasoning}\n\nApprove this call?`,
			`Review: ${event.toolName}`,
		);

		if (approved) return;

		return {
			block: true,
			reason: `Tool call "${event.toolName}" was not approved by user.`,
		};
	});
}
