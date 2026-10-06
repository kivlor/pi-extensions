/**
 * Multiplexer - virtual models that rotate through provider variants on repeated failures.
 *
 * Config: ~/.pi/multiplexer.json
 * {
 *   "models": {
 *     "glm-5.3": ["opencode-go/glm-5.3", "openrouter/z-ai/glm-5.3"],
 *     "claude-sonnet": ["opencode-go/claude-sonnet-4-5", "openrouter/anthropic/claude-sonnet-4"]
 *   }
 * }
 *
 * Creates virtual models like `multiplexer/glm-5.3` that try variants in order.
 * - For 429 rate limit errors: switch immediately to next variant
 * - For quota/billing errors: switch immediately to next variant
 * - For other errors: switch after 3 consecutive failures
 * Continues until success or all variants exhausted.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { ExtensionAPI, ModelRoute, ModelRouteRequest } from "@earendil-works/pi-coding-agent";

interface MultiplexerConfig {
	models: Record<string, string[]>;
}

interface MuxState {
	/** Current variant index. */
	index: number;
	/** Consecutive error count for current variant. */
	consecutiveErrors: number;
	/** Total attempts across all variants this request chain. */
	totalAttempts: number;
}

type MuxRequest = ModelRouteRequest<MuxState>;

const ERRORS_BEFORE_SWITCH = 3;

// Non-retryable error patterns - switch immediately (quota/billing exhaustion)
const NON_RETRYABLE_ERROR_PATTERN = /(?:GoUsageLimitError|FreeUsageLimitError|insufficient_quota|out of budget|quota exceeded|billing|Monthly usage limit reached|available balance)/i;

// Rate limit patterns - switch immediately to next variant
const RATE_LIMIT_PATTERN = /(?:429|rate limit|too many requests|ratelimit|request limit exceeded)/i;

const configPath = join(homedir(), ".pi", "multiplexer.json");

function loadConfig(): MultiplexerConfig | null {
	if (!existsSync(configPath)) return null;
	try {
		return JSON.parse(readFileSync(configPath, "utf-8"));
	} catch (e) {
		console.error(`[multiplexer] Failed to load config from ${configPath}:`, e);
		return null;
	}
}

export default function (pi: ExtensionAPI) {
	const config = loadConfig();
	if (!config) {
		console.error(`[multiplexer] No config found at ${configPath}`);
		return;
	}

	for (const [modelId, variants] of Object.entries(config.models)) {
		if (!Array.isArray(variants) || variants.length === 0) {
			console.error(`[multiplexer] Invalid variants for model ${modelId}`);
			continue;
		}

		pi.registerVirtualModel<MuxState>({
			provider: "multiplexer",
			id: modelId,
			name: modelId,
			thinkingLevels: ["low", "medium", "high"],
			route(request: MuxRequest, ctx) {
				const totalVariants = variants.length;

				// Initialize state
				let state = request.state;
				if (!state) {
					state = { index: 0, consecutiveErrors: 0, totalAttempts: 0 };
				}

				// Check for failed message
				if (request.failed?.errorMessage) {
					// For non-retryable errors (quota/billing), switch immediately
					// These aren't transient - the variant is blocked until fixed
					if (NON_RETRYABLE_ERROR_PATTERN.test(request.failed.errorMessage)) {
						const nextIndex = state.index + 1;
						if (nextIndex >= totalVariants) {
							console.error(`[multiplexer/${modelId}] All ${totalVariants} variants exhausted (non-retryable error)`);
						} else {
							console.log(
								`[multiplexer/${modelId}] Non-retryable error on variant ${state.index}, switching to ${nextIndex}`
							);
						}
						state = {
							index: nextIndex,
							consecutiveErrors: 0,
							totalAttempts: state.totalAttempts + 1,
						};
					}
					// For rate limit errors (429), switch immediately to next variant
					// Rate limits are transient but better to try another variant than wait
					else if (RATE_LIMIT_PATTERN.test(request.failed.errorMessage)) {
						const nextIndex = state.index + 1;
						if (nextIndex >= totalVariants) {
							console.error(`[multiplexer/${modelId}] All ${totalVariants} variants exhausted (rate limit)`);
						} else {
							console.log(
								`[multiplexer/${modelId}] Rate limit on variant ${state.index}, switching to ${nextIndex}`
							);
						}
						state = {
							index: nextIndex,
							consecutiveErrors: 0,
							totalAttempts: state.totalAttempts + 1,
						};
					}
					// For other retryable errors, track failures and switch after N consecutive
					else if (request.reason === "retry") {
						state = {
							index: state.index,
							consecutiveErrors: state.consecutiveErrors + 1,
							totalAttempts: state.totalAttempts + 1,
						};

						console.log(
							`[multiplexer/${modelId}] Error ${state.consecutiveErrors}/${ERRORS_BEFORE_SWITCH} on variant ${state.index} (${variants[state.index]})`
						);

						// Switch variant after ERRORS_BEFORE_SWITCH consecutive failures
						if (state.consecutiveErrors >= ERRORS_BEFORE_SWITCH) {
							const nextIndex = state.index + 1;
							if (nextIndex >= totalVariants) {
								console.error(`[multiplexer/${modelId}] All ${totalVariants} variants exhausted`);
							} else {
								console.log(
									`[multiplexer/${modelId}] Switching from variant ${state.index} to ${nextIndex}`
								);
							}
							state = {
								index: nextIndex,
								consecutiveErrors: 0,
								totalAttempts: state.totalAttempts,
							};
						}
					}
				}

				// If we've exhausted all variants, let pi handle the error
				if (state.index >= totalVariants) {
					console.error(`[multiplexer/${modelId}] No more variants to try`);
					if (request.failed) {
						return {
							model: request.failed.model,
							thinkingLevel: request.failed.thinkingLevel ?? "medium",
							state,
						};
					}
				}

				// Parse current variant: "provider/model-id" or "provider/namespace/model-id"
				const variant = variants[state.index];
				const parts = variant.split("/");
				const providerId = parts[0];
				const variantModelId = parts.slice(1).join("/");

				const model = ctx.modelRegistry.find(providerId, variantModelId);
				if (!model) {
					throw new Error(`[multiplexer/${modelId}] Model not found: ${variant}`);
				}

				console.log(
					`[multiplexer/${modelId}] Routing to ${variant}` +
						(state.totalAttempts > 0 ? ` (attempt ${state.totalAttempts + 1})` : "")
				);

				const route: ModelRoute<MuxState> = {
					model,
					thinkingLevel: request.thinkingLevel,
					state,
				};

				return route;
			},
		});

		console.log(
			`[multiplexer] Registered multiplexer/${modelId} with ${variants.length} variant(s): ${variants.join(", ")}`
		);
	}
}
