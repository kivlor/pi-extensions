/**
 * pi-subagents — entry point.
 *
 * Registers:
 *   - `subagent` tool: run a bounded task in a fresh child session
 *   - `/agents` command: list discovered custom agents
 *   - `/agents:new <name>` command: scaffold a new custom agent markdown file
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { subagentTool } from "./subagent.ts";
import { discoverAgents, agentsDirs } from "./agents.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export default function subagentsLite(pi: ExtensionAPI): void {
  pi.registerTool(subagentTool);

  pi.registerCommand("agents", {
    description: "List, view, or create custom subagents",
    handler: async (args, ctx: ExtensionCommandContext) => {
      const trimmed = (args || "").trim();
      const agents = discoverAgents();

      if (trimmed === "new") {
        ctx.ui.notify("Usage: /agents:new <name> [description]", "info");
        return;
      }

      const newMatch = trimmed.match(/^new\s+(\S+)(?:\s+(.*))?$/);
      if (newMatch) {
        const name = newMatch[1];
        const description = newMatch[2] || `Custom agent "${name}"`;
        const dir = agentsDirs()[1]; // ~/.pi/agent/agents
        mkdirSync(dir, { recursive: true });
        const path = join(dir, `${name}.md`);
        const template = `---\ndescription: ${description}\n---\n\nYou are a ${name} agent. Describe the system prompt for this agent here.\n`;
        writeFileSync(path, template);
        ctx.ui.notify(`Created ${path}`, "info");
        return;
      }

      if (trimmed) {
        const agent = agents.find((a) => a.name === trimmed);
        if (!agent) {
          ctx.ui.notify(`No agent named "${trimmed}"`, "warning");
          return;
        }
        ctx.ui.notify(
          `${agent.name}${agent.description ? ` — ${agent.description}` : ""}` +
            `${agent.model ? `\nmodel: ${agent.model}` : ""}` +
            `${agent.thinking ? `\nthinking: ${agent.thinking}` : ""}` +
            `\nsource: ${agent.source}`,
          "info",
        );
        return;
      }

      if (agents.length === 0) {
        ctx.ui.notify(
          "No custom agents found. Create one with /agents:new <name>, or add .md files to ~/.pi/agent/agents/",
          "info",
        );
        return;
      }
      ctx.ui.notify(
        `Custom agents:\n${agents
          .map((a) => `  ${a.name}${a.description ? ` — ${a.description}` : ""}`)
          .join("\n")}`,
        "info",
      );
    },
  });
}