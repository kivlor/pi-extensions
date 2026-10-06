/**
 * Pure helpers for the Agent Memory Repo format
 * (https://github.com/AgentMemoryRepo/agentmemoryrepo).
 *
 * Entries are single-line bullets with optional bracketed metadata:
 *   - John leads the product team [source: /path/session.jsonl; added: 2026-10-06]
 * Cross-links use [[path]] from the memory root; .md is omitted for Markdown.
 */

export const MEMORY_FILE = "MEMORY.md";
export const INDEX_HEADING = "## Index";

export function todayISO(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export interface EntryMeta {
  source?: string;
  added?: string;
  extra?: Record<string, string>;
}

/** Format a spec entry: bullet, text, bracketed metadata with `source` then `added`, then extras. */
export function formatEntry(text: string, meta: EntryMeta = {}): string {
  const parts: string[] = [];
  if (meta.source) parts.push(`source: ${meta.source}`);
  if (meta.added) parts.push(`added: ${meta.added}`);
  for (const [key, value] of Object.entries(meta.extra ?? {})) parts.push(`${key}: ${value}`);
  return parts.length ? `- ${text} [${parts.join("; ")}]` : `- ${text}`;
}

/** Find the first line containing `oldText` (substring match), or -1. */
export function findEntryLine(lines: string[], oldText: string): number {
  const needle = oldText.trim();
  if (!needle) return -1;
  return lines.findIndex((line) => line.includes(needle));
}

/**
 * Insert an entry line into file content. In MEMORY.md, entries go at the top
 * (above the `## Index` heading, after any existing entries); other files append at the end.
 */
export function insertEntry(content: string, entryLine: string, isMemoryFile: boolean): string {
  if (isMemoryFile) {
    const lines = content.split("\n");
    const idx = lines.findIndex((line) => line.trim() === INDEX_HEADING);
    if (idx >= 0) {
      let insertAt = idx;
      while (insertAt > 0 && lines[insertAt - 1].trim() === "") insertAt--;
      if (insertAt > 0 && lines[insertAt - 1].startsWith("#")) lines.splice(insertAt, 0, "");
      lines.splice(insertAt, 0, entryLine);
      return lines.join("\n");
    }
  }
  return `${content.trimEnd()}\n${entryLine}\n`;
}

/** Link form of a repo-relative file path for the index: omit .md for Markdown. */
export function linkPathForFile(relPath: string): string {
  return relPath.endsWith(".md") ? relPath.slice(0, -3) : relPath;
}

/** Add an index bullet under `## Index`, creating the section if missing. No-op if already indexed. */
export function upsertIndexLink(content: string, link: string): { content: string; changed: boolean } {
  const bullet = `- [[${link}]]`;
  if (content.includes(`[[${link}]]`)) return { content, changed: false };
  const lines = content.split("\n");
  const idx = lines.findIndex((line) => line.trim() === INDEX_HEADING);
  if (idx < 0) {
    return { content: `${content.trimEnd()}\n\n${INDEX_HEADING}\n${bullet}\n`, changed: true };
  }
  let end = idx + 1;
  while (end < lines.length && !/^#{2,6}\s/.test(lines[end])) end++;
  let insertAt = end;
  while (insertAt > idx + 1 && lines[insertAt - 1].trim() === "") insertAt--;
  lines.splice(insertAt, 0, bullet);
  return { content: lines.join("\n"), changed: true };
}

/** Strip [[ ]] if present and trim. */
export function stripLinkBrackets(path: string): string {
  let p = path.trim();
  if (p.startsWith("[[") && p.endsWith("]]") && p.length > 4) p = p.slice(2, -2).trim();
  return p;
}

/**
 * Normalize a repo-relative path: reject empty, absolute, `..` escapes, backslashes,
 * and drive letters. Returns the clean relative path or null when invalid.
 */
export function sanitizeRelPath(input: string): string | null {
  const p = stripLinkBrackets(input);
  if (!p || p.includes("\\") || p.includes("\0") || /^[a-zA-Z]:/.test(p) || p.startsWith("/")) return null;
  const segments = p.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  if (segments.some((s) => s === "." || s === "..")) return null;
  return segments.join("/");
}

export interface ResolvedLink {
  path: string | null;
  tried: string[];
}

/**
 * Resolve a [[link]] to an existing repo-relative file path. Markdown files may be
 * referenced without .md; `memory`/`MEMORY` map to MEMORY.md.
 */
export function resolveLinkPath(link: string, exists: (relPath: string) => boolean): ResolvedLink {
  const p = sanitizeRelPath(link);
  if (!p) return { path: null, tried: [] };
  const tried: string[] = [];
  const lower = p.toLowerCase();
  if (lower === "memory" || lower === "memory.md") {
    tried.push(MEMORY_FILE);
    if (exists(MEMORY_FILE)) return { path: MEMORY_FILE, tried };
  } else {
    if (exists(p)) return { path: p, tried: [p] };
    tried.push(p);
    const withMd = p.endsWith(".md") ? p : `${p}.md`;
    if (withMd !== p && exists(withMd)) return { path: withMd, tried: [...tried, withMd] };
    tried.push(withMd);
  }
  return { path: null, tried };
}
