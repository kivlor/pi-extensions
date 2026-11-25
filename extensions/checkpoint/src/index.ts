/**
 * pi-checkpoint — entry point.
 *
 * Registers:
 *   - `checkpoint` tool: fork this session's full context into a child agent
 *     and have it run a task (no lossy summary handoff)
 *
 * See PLAN.md for the implementation plan and open design questions.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { checkpointTool } from "./checkpoint.ts";

export default function checkpointExtension(pi: ExtensionAPI): void {
  pi.registerTool(checkpointTool);
}
