/**
 * Goal state and helpers — simplified port of Michaelliv/pi-goal.
 */

export type GoalStatus = "active" | "paused" | "error_paused" | "budget_limited" | "complete";

export interface GoalState {
	id: string;
	objective: string;
	status: GoalStatus;
	tokenBudget: number | null;
	tokensUsed: number;
	timeUsedSeconds: number;
	createdAt: number;
	updatedAt: number;
	/** Number of consecutive turns that ended with an error. */
	consecutiveErrors: number;
	/** The last error message seen, if any. */
	lastError: string | null;
}

/** Parse "--tokens 50k" / "--tokens=1m" from a /goal argument string. */
export function parseTokenBudget(input: string): { objective: string; tokenBudget: number | null; error?: string } {
	const match = input.match(/(?:^|\s)--tokens(?:=|\s+)(\S+\s*[kKmM]?)(?:\s|$)/);
	if (!match) return { objective: input.trim(), tokenBudget: null };

	const raw = match[1].replace(/\s+/g, "");
	const suffix = raw.slice(-1).toLowerCase();
	const numeric = suffix === "k" || suffix === "m" ? raw.slice(0, -1) : raw;
	const value = Number(numeric);
	if (!Number.isFinite(value) || value <= 0) {
		return { objective: input.trim(), tokenBudget: null, error: "Token budget must be positive." };
	}
	const multiplier = suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
	const tokenBudget = Math.round(value * multiplier);
	const objective = (input.slice(0, match.index) + " " + input.slice((match.index ?? 0) + match[0].length)).trim();
	return { objective, tokenBudget };
}

export function formatTokens(value: number): string {
	if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
	if (value >= 1_000) return `${Math.round(value / 100) / 10}K`;
	return String(value);
}

export function formatElapsed(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const rem = minutes % 60;
	return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

export function statusLine(state: GoalState | null): string | undefined {
	if (!state) return undefined;
	const budget = state.tokenBudget
		? ` (${formatTokens(state.tokensUsed)} / ${formatTokens(state.tokenBudget)})`
		: ` (${formatElapsed(state.timeUsedSeconds)})`;
	if (state.status === "active") return `Pursuing goal${budget}`;
	if (state.status === "paused") return "Goal paused (/goal resume)";
	if (state.status === "error_paused") return `Goal paused due to errors (${state.lastError ?? "unknown"})`;
	if (state.status === "budget_limited") return `Goal unmet${budget}`;
	return `Goal achieved${budget}`;
}

export function truncateObjective(objective: string, max = 96): string {
	const singleLine = objective.replace(/\s+/g, " ").trim();
	return singleLine.length > max ? `${singleLine.slice(0, max - 1)}…` : singleLine;
}

/** Default threshold for consecutive errors before pausing. */
export const ERROR_PAUSE_THRESHOLD = 3;

export function createGoalState(objective: string, tokenBudget: number | null, now = Date.now()): GoalState {
	return {
		id: `${now}-${Math.random().toString(16).slice(2)}`,
		objective,
		status: "active",
		tokenBudget,
		tokensUsed: 0,
		timeUsedSeconds: 0,
		createdAt: now,
		updatedAt: now,
		consecutiveErrors: 0,
		lastError: null,
	};
}

/** Add a turn's token/time usage, tracking consecutive errors. */
export function accountGoalTurn(
	state: GoalState,
	tokenDelta: number,
	elapsedSeconds: number,
	isError = false,
	errorMessage: string | null = null,
	now = Date.now(),
): GoalState {
	let next: GoalState = {
		...state,
		tokensUsed: state.tokensUsed + Math.max(0, tokenDelta),
		timeUsedSeconds: state.timeUsedSeconds + Math.max(0, elapsedSeconds),
		updatedAt: now,
		// Reset consecutive errors on successful turn, increment on error
		consecutiveErrors: isError ? state.consecutiveErrors + 1 : 0,
		lastError: isError ? errorMessage : null,
	};
	if (next.status === "active" && next.tokenBudget != null && next.tokensUsed >= next.tokenBudget) {
		next = { ...next, status: "budget_limited" };
	}
	return next;
}

/** Token delta from a turn_end usage snapshot. */
export function tokenDeltaFromUsage(usage: {
	totalTokens?: number;
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
} | null | undefined): number {
	if (!usage) return 0;
	if (typeof usage.totalTokens === "number") return Math.max(0, usage.totalTokens);
	const input = Number(usage.input) || 0;
	const output = Number(usage.output) || 0;
	const cacheRead = Number(usage.cacheRead) || 0;
	const cacheWrite = Number(usage.cacheWrite) || 0;
	return Math.max(0, input + output + cacheRead + cacheWrite);
}