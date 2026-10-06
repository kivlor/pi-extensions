/**
 * @kivlor/pi-memory — Agent Memory Repo for pi.
 *
 * Implements Cognition's spec: agent memory as a git repo — MEMORY.md entry point,
 * one-line bullet entries with [source: …; added: …] metadata, [[path]] cross-links,
 * commit after every edit.
 *
 * Tools: memory_init, memory_search, memory_read, memory_save
 * Command: /memory — repo path, entry count, last commit, dirty status
 *
 * Session-start injection: once per session, inject MEMORY.md + usage instructions
 * so memory persists across sessions without user invocation.
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI, type ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { homedir } from "node:os";
import {
  MEMORY_FILE,
  INDEX_HEADING,
  todayISO,
  formatEntry,
  findEntryLine,
  insertEntry,
  linkPathForFile,
  upsertIndexLink,
  stripLinkBrackets,
  sanitizeRelPath,
  resolveLinkPath,
  type EntryMeta,
} from "./format.ts";
import {
  gitAvailable,
  isGitRepo,
  gitInitRepo,
  gitCommitAll,
  gitStatus,
  type RepoGitStatus,
} from "./git.ts";

const DEFAULT_MEMORY_DIR = join(homedir(), ".pi", "memory");

let memoryDir: string | null = null;
let sessionInjected = false;

function getMemoryDir(): string {
  if (memoryDir) return memoryDir;
  const envDir = process.env.PI_MEMORY_DIR;
  memoryDir = envDir && envDir.trim() ? envDir.trim() : DEFAULT_MEMORY_DIR;
  return memoryDir;
}

function ensureMemoryDir(): void {
  const dir = getMemoryDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getMemoryPath(): string {
  return join(getMemoryDir(), MEMORY_FILE);
}

function readMemoryFile(): string {
  const path = getMemoryPath();
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

function writeMemoryFile(content: string): void {
  writeFileSync(getMemoryPath(), content, "utf-8");
}

function readFile(relPath: string): string | null {
  const fullPath = join(getMemoryDir(), relPath);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, "utf-8");
}

function writeFile(relPath: string, content: string): void {
  const fullPath = join(getMemoryDir(), relPath);
  const dir = join(fullPath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(fullPath, content, "utf-8");
}

function fileExists(relPath: string): boolean {
  return existsSync(join(getMemoryDir(), relPath));
}

function listMarkdownFiles(): string[] {
  const dir = getMemoryDir();
  const results: string[] = [];
  
  function walk(d: string, prefix: string = ""): void {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) {
        walk(full, rel);
      } else if (name.endsWith(".md")) {
        results.push(rel);
      }
    }
  }
  
  if (existsSync(dir)) {
    walk(dir);
  }
  return results;
}

function countEntries(content: string): number {
  const lines = content.split("\n");
  return lines.filter((l) => l.startsWith("- ") && l.trim().length > 2).length;
}

async function autoCommit(message: string, signal?: AbortSignal): Promise<void> {
  const dir = getMemoryDir();
  if (!await isGitRepo(dir, signal)) return;
  await gitCommitAll(dir, message, signal);
}

// Session-start injection message
function injectionMessage(memoryContent: string): string {
  const truncated = memoryContent.length > 8000 
    ? memoryContent.slice(0, 8000) + "\n\n[... truncated ...]"
    : memoryContent;
  
  return `# Agent Memory Repository

This session has access to a persistent memory repository. Use it to recall preferences, decisions, and context from previous sessions.

## MEMORY.md

\`\`\`markdown
${truncated}
\`\`\`

## Usage

- \`memory_init\` — Initialize or open the memory repo (run once per session if needed)
- \`memory_search "<pattern>"\` — Regex search across all memory files
- \`memory_read "[[link]]"\` — Read a file by path (omit .md for markdown files)
- \`memory_save "<entry>"\` — Append a new entry to MEMORY.md or update an existing one

Entries are single-line bullets with optional \`[source: …; added: YYYY-MM-DD]\` metadata. Cross-link related topics with \`[[path]]\` syntax.

Only write to memory when the user explicitly asks you to remember something, or when you learn a durable preference, decision, or fact that would be useful in future sessions.`;
}

// Tool: memory_init
const memoryInitTool = defineTool({
  name: "memory_init",
  label: "Initialize Memory Repo",
  description: 
    "Initialize or open the agent memory repository. Creates the repo at ~/.pi/memory (or PI_MEMORY_DIR) " +
    "if missing, initializes git, and returns the MEMORY.md content. Run this once when memory tools are first needed.",
  promptSnippet: "Initialize the memory repo before using other memory tools",
  parameters: Type.Object({}),
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },

  async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
    ensureMemoryDir();
    const dir = getMemoryDir();
    const memoryPath = getMemoryPath();
    
    // Initialize git if needed
    const gitOk = await gitAvailable();
    let gitInitialized = false;
    if (gitOk && !await isGitRepo(dir, signal)) {
      const result = await gitInitRepo(dir, signal);
      gitInitialized = result.ok;
    } else if (await isGitRepo(dir, signal)) {
      gitInitialized = true;
    }
    
    // Create MEMORY.md if missing
    let content: string;
    let isNew = false;
    if (!existsSync(memoryPath)) {
      const now = todayISO();
      content = `# Agent Memory\n\nPersonal preferences, decisions, and cross-session context.\n\n${INDEX_HEADING}\n`;
      writeMemoryFile(content);
      isNew = true;
      
      if (gitInitialized) {
        await autoCommit("Initialize MEMORY.md", signal);
      }
    } else {
      content = readMemoryFile();
    }
    
    const status = await gitStatus(dir, signal);
    
    return {
      content: [{ 
        type: "text", 
        text: JSON.stringify({
          path: dir,
          memoryFile: memoryPath,
          isNew,
          gitInitialized,
          entries: countEntries(content),
          status: status.dirty ? "dirty" : "clean",
          lastCommit: status.lastCommit,
        }, null, 2) + "\n\n---\n\n" + content,
      }],
      details: { dir, isNew, gitInitialized },
    };
  },
});

// Tool: memory_search
const memorySearchTool = defineTool({
  name: "memory_search",
  label: "Search Memory",
  description:
    "Regex search across all files in the memory repository. Returns matching lines with file:line prefixes. " +
    "Use to find entries about a topic, preference, or decision.",
  promptSnippet: "Search memory for preferences, decisions, or past context",
  parameters: Type.Object({
    pattern: Type.String({ 
      description: "ECMAScript regex pattern to search for (case-insensitive)" 
    }),
  }),
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },

  async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
    const { pattern } = params;
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, "im");
    } catch (e) {
      return {
        content: [{ type: "text", text: `Invalid regex: ${e instanceof Error ? e.message : String(e)}` }],
        isError: true,
      };
    }
    
    const dir = getMemoryDir();
    if (!existsSync(dir)) {
      return { content: [{ type: "text", text: "Memory repo not initialized. Run memory_init first." }], isError: true };
    }
    
    const matches: string[] = [];
    
    for (const relPath of listMarkdownFiles()) {
      const content = readFile(relPath);
      if (!content) continue;
      
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push(`${relPath}:${i + 1}: ${lines[i]}`);
        }
      }
    }
    
    if (matches.length === 0) {
      return { content: [{ type: "text", text: `No matches for /${pattern}/` }] };
    }
    
    const truncated = matches.length > 50 ? matches.slice(0, 50).concat(`... (${matches.length - 50} more)`) : matches;
    return { content: [{ type: "text", text: truncated.join("\n") }] };
  },
});

// Tool: memory_read
const memoryReadTool = defineTool({
  name: "memory_read",
  label: "Read Memory File",
  description:
    "Read a file from the memory repository by [[link]] path. Markdown files may omit the .md extension. " +
    "Returns the file content or an error if not found.",
  promptSnippet: "Read a memory file to follow cross-links or recall details",
  parameters: Type.Object({
    path: Type.String({ 
      description: "Repo-relative path or [[link]] to read. Omit .md for markdown files." 
    }),
  }),
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },

  async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
    const { path } = params;
    const resolved = resolveLinkPath(path, fileExists);
    
    if (!resolved.path) {
      const tried = resolved.tried.length ? resolved.tried.join(", ") : "(invalid path)";
      return {
        content: [{ type: "text", text: `File not found: ${path}\nTried: ${tried}` }],
        isError: true,
      };
    }
    
    const content = readFile(resolved.path);
    if (content === null) {
      return { content: [{ type: "text", text: `Failed to read: ${resolved.path}` }], isError: true };
    }
    
    return { content: [{ type: "text", text: content }] };
  },
});

// Tool: memory_save
const memorySaveTool = defineTool({
  name: "memory_save",
  label: "Save Memory Entry",
  description:
    "Append or update an entry in the memory repository. Creates MEMORY.md if missing. " +
    "Auto-stamps with `added: YYYY-MM-DD` and `source: session-id`. Auto-commits to git. " +
    "Use `oldText` to replace a matching entry (e.g. to update a preference).",
  promptSnippet: "Save a preference, decision, or fact to memory",
  promptGuidelines: [
    "Only save to memory when the user explicitly asks to remember something, or when you learn a durable preference.",
    "Entries should be single-line bullets; break complex topics into separate entries.",
    "Cross-link related entries with [[link]] syntax.",
  ],
  parameters: Type.Object({
    text: Type.String({ 
      description: "The entry text to save (single line, no bullet prefix)" 
    }),
    oldText: Type.Optional(Type.String({
      description: "If provided, replace the first entry containing this substring"
    })),
    path: Type.Optional(Type.String({
      description: "File to write to (default: MEMORY.md). Creates new files for topics."
    })),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },

  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    const { text, oldText, path } = params;
    const trimmed = text.trim();
    
    if (!trimmed) {
      return { content: [{ type: "text", text: "Entry text is required." }], isError: true };
    }
    
    ensureMemoryDir();
    
    // Determine target file
    const targetPath = path ? sanitizeRelPath(path) : MEMORY_FILE;
    if (!targetPath) {
      return { content: [{ type: "text", text: `Invalid path: ${path}` }], isError: true };
    }
    
    const isMemoryFile = targetPath === MEMORY_FILE;
    let content = readFile(targetPath) ?? "";
    const isNew = content === "";
    
    // Create file content for new non-MEMORY.md files
    if (isNew && !isMemoryFile) {
      const name = targetPath.replace(/\.md$/, "").replace(/[/\\]/g, " — ");
      content = `# ${name}\n\n${INDEX_HEADING}\n`;
    }
    
    // Format entry with metadata
    const sessionId = ctx.sessionManager.getSessionHeader?.()?.id ?? "unknown";
    const meta: EntryMeta = {
      source: sessionId,
      added: todayISO(),
    };
    const entryLine = formatEntry(trimmed, meta);
    
    // Update or insert
    const lines = content.split("\n");
    const oldLineIdx = oldText ? findEntryLine(lines, oldText) : -1;
    
    if (oldLineIdx >= 0) {
      // Replace existing entry
      lines[oldLineIdx] = entryLine;
      content = lines.join("\n");
    } else {
      // Insert new entry
      content = insertEntry(content, entryLine, isMemoryFile);
    }
    
    // Ensure index link for new files
    if (!isMemoryFile && isNew) {
      const link = linkPathForFile(targetPath);
      const memoryContent = readMemoryFile();
      const { content: updatedMemory, changed } = upsertIndexLink(memoryContent, link);
      if (changed) {
        writeMemoryFile(updatedMemory);
      }
    }
    
    // Write file
    writeFile(targetPath, content);
    
    // Auto-commit
    const commitMsg = oldText
      ? `Update entry in ${targetPath}`
      : `Add entry to ${targetPath}`;
    await autoCommit(commitMsg, signal);
    
    return {
      content: [{ 
        type: "text", 
        text: JSON.stringify({
          path: targetPath,
          entry: entryLine,
          isNew,
          updated: oldLineIdx >= 0,
        }, null, 2),
      }],
      details: { path: targetPath, entry: entryLine },
    };
  },
});

export default function piMemory(pi: ExtensionAPI): void {
  // Register all 4 tools
  pi.registerTool(memoryInitTool);
  pi.registerTool(memorySearchTool);
  pi.registerTool(memoryReadTool);
  pi.registerTool(memorySaveTool);

  // /memory command
  pi.registerCommand("memory", {
    description: "Show memory repo status: path, entries, last commit, dirty state",
    handler: async (_args, ctx) => {
      const dir = getMemoryDir();
      
      if (!existsSync(dir)) {
        ctx.ui.notify(`Memory repo not initialized. Run memory_init or set PI_MEMORY_DIR.`, "info");
        return;
      }
      
      const memoryPath = getMemoryPath();
      const memoryContent = existsSync(memoryPath) ? readMemoryFile() : "";
      const entries = countEntries(memoryContent);
      
      const status = await gitStatus(dir);
      const files = listMarkdownFiles();
      
      const info = [
        `Path: ${dir}`,
        `Files: ${files.length} markdown files`,
        `Entries: ${entries} in MEMORY.md`,
        `Git: ${status.dirty ? "dirty" : "clean"} (${status.changes} changes)`,
        status.lastCommit 
          ? `Last commit: ${status.lastCommit.hash} ${status.lastCommit.date} — ${status.lastCommit.subject}`
          : "No commits",
      ].join("\n");
      
      ctx.ui.notify(info, "info");
    },
  });

  // Session-start injection: once per session, inject MEMORY.md content
  pi.on("session_start", async (_event, ctx) => {
    if (sessionInjected) return;
    sessionInjected = true;
    
    const dir = getMemoryDir();
    if (!existsSync(dir)) return;
    
    const memoryPath = getMemoryPath();
    if (!existsSync(memoryPath)) return;
    
    const memoryContent = readMemoryFile();
    if (!memoryContent.trim()) return;
    
    // Inject as a steer message (system-level context)
    pi.sendMessage(
      {
        customType: "pi-memory-injection",
        content: injectionMessage(memoryContent),
        display: false,
        details: { injected: true, timestamp: Date.now() },
      },
      { deliverAs: "steer" },
    );
    
    ctx.ui.setStatus("pi-memory", "mem");
  });

  // Before agent start: inject memory if not yet done (guard for race conditions)
  pi.on("before_agent_start", (_event, _ctx) => {
    // The session_start handler already injected; this is a safety net
    // but we don't want to double-inject, so just return undefined
    return undefined;
  });
}
