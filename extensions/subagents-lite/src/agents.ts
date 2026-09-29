/**
 * Custom agent discovery — Codex-style markdown agent definitions.
 *
 * An agent is a markdown file with optional YAML frontmatter:
 *
 *   ---
 *   description: Reviews code for bugs and security issues
 *   model: anthropic/claude-sonnet-4.5
 *   thinking: medium
 *   tools: ["read", "bash", "grep"]
 *   ---
 *
 *   You are a meticulous code reviewer. ... (system prompt body)
 *
 * Agents are discovered from:
 *   1. .pi/agents/ in the current project (highest priority)
 *   2. ~/.pi/agent/agents/
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface AgentDefinition {
  name: string;
  description: string;
  model?: string;
  thinking?: string;
  /** Optional tool allowlist. Undefined = inherit session defaults. */
  tools?: string[];
  /** The markdown body below the frontmatter — used as the agent's system prompt. */
  systemPrompt: string;
  source: string;
}

export function agentsDirs(): string[] {
  return [
    join(process.cwd(), ".pi", "agents"),
    join(homedir(), ".pi", "agent", "agents"),
  ];
}

function parseFrontmatter(raw: string, source: string): AgentDefinition | undefined {
  const name = source.replace(/\.md$/i, "");
  if (!raw.startsWith("---")) {
    return {
      name,
      description: "",
      systemPrompt: raw.trim(),
      source,
    };
  }

  const rest = raw.slice(3);
  const endMatch = rest.match(/^---\s*$/m);
  if (!endMatch || endMatch.index === undefined) return undefined;

  const end = endMatch.index;
  const header = rest.slice(0, end);
  const body = rest.slice(end).replace(/^---\s*\n/, "").trim();

  const meta: Record<string, string> = {};
  const lists: Record<string, string[]> = {};
  for (const line of header.split("\n")) {
    const m = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (value.trim().startsWith("[")) {
      lists[key.toLowerCase()] = (value.match(/\[([^\]]*)\]/)?.[1] ?? "")
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else {
      meta[key.toLowerCase()] = value.trim().replace(/^['"]|['"]$/g, "");
    }
  }

  return {
    name: meta.name || name,
    description: meta.description ?? "",
    model: meta.model,
    thinking: meta.thinking,
    tools: lists.tools,
    systemPrompt: body,
    source,
  };
}

export function discoverAgents(): AgentDefinition[] {
  const byName = new Map<string, AgentDefinition>();
  for (const dir of agentsDirs()) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".md")) continue;
      const path = join(dir, file);
      try {
        const agent = parseFrontmatter(readFileSync(path, "utf8"), file);
        if (agent && agent.systemPrompt) byName.set(agent.name, agent);
      } catch {
        // unreadable file — skip
      }
    }
  }
  return [...byName.values()];
}

export function findAgent(name: string): AgentDefinition | undefined {
  return discoverAgents().find((a) => a.name === name);
}