/**
 * Exa client — REST API (api.exa.ai) with an MCP fallback (mcp.exa.ai)
 * for unauthenticated use, mirroring pi-web-access's Exa lane.
 *
 * Config resolution order (same as pi-web-access):
 *   1. `exaApiKey` in ~/.pi/agent/web-search.json
 *   2. EXA_API_KEY environment variable
 * Base URL: `exaBaseUrl` in config, else EXA_BASE_URL, else https://api.exa.ai
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const EXA_API_BASE_URL = "https://api.exa.ai";
export const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
export const EXA_MCP_BASIC_TOOL = "web_search_exa";

const REQUEST_TIMEOUT_MS = 60_000;

export interface SearchOptions {
  numResults?: number;
  includeContent?: boolean;
  recencyFilter?: "day" | "week" | "month" | "year";
  domainFilter?: string[];
  signal?: AbortSignal;
}

export interface ExaResult {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
  author?: string;
}

export interface SearchResponse {
  answer: string;
  results: { title: string; url: string; snippet: string }[];
  inlineContent?: { url: string; title: string; content: string }[];
}

export function getWebSearchConfigPath(): string {
  return join(homedir(), ".pi", "agent", "web-search.json");
}

let cachedConfig: Record<string, unknown> | null = null;

export function loadConfig(): Record<string, unknown> {
  if (cachedConfig) return cachedConfig;
  const path = getWebSearchConfigPath();
  if (!existsSync(path)) {
    cachedConfig = {};
    return cachedConfig;
  }
  try {
    cachedConfig = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    cachedConfig = {};
  }
  return cachedConfig;
}

export function getApiKey(): string | undefined {
  const config = loadConfig();
  const configured = config.exaApiKey;
  if (typeof configured === "string" && configured.length > 0) return configured;
  const env = process.env.EXA_API_KEY;
  return env && env.length > 0 ? env : undefined;
}

export function getApiBaseUrl(): string {
  const config = loadConfig();
  const configured = config.exaBaseUrl;
  if (typeof configured === "string" && configured.length > 0) return configured;
  const env = process.env.EXA_BASE_URL;
  return env && env.length > 0 ? env : EXA_API_BASE_URL;
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

// ---------- argument helpers (exported for tests) ----------

export function recencyToStartDate(filter: "day" | "week" | "month" | "year"): string {
  const offsets = { day: 1, week: 7, month: 30, year: 365 } as const;
  const days = offsets[filter] ?? 0;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function mapDomainFilter(domainFilter?: string[]): {
  includeDomains?: string[];
  excludeDomains?: string[];
} {
  if (!domainFilter?.length) return {};
  const includeDomains = domainFilter
    .filter((d) => !d.startsWith("-") && d.trim().length > 0)
    .map((d) => d.trim());
  const excludeDomains = domainFilter
    .filter((d) => d.startsWith("-"))
    .map((d) => d.slice(1).trim())
    .filter(Boolean);
  return {
    ...(includeDomains.length ? { includeDomains } : {}),
    ...(excludeDomains.length ? { excludeDomains } : {}),
  };
}

export function buildMcpQuery(query: string, options: SearchOptions): string {
  const parts = [query];
  for (const d of options.domainFilter ?? []) {
    parts.push(d.startsWith("-") ? `-site:${d.slice(1)}` : `site:${d}`);
  }
  switch (options.recencyFilter) {
    case "day": parts.push("past 24 hours"); break;
    case "week": parts.push("past week"); break;
    case "month": parts.push(new Date().toLocaleString("en", { month: "long", year: "numeric" })); break;
    case "year": parts.push(String(new Date().getFullYear())); break;
  }
  return parts.join(" ");
}

// ---------- REST API ----------

async function exaRest<T>(path: string, body: unknown, apiKey: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "x-exa-integration": "@kivlor/pi-web-search",
    },
    body: JSON.stringify(body),
    signal: requestSignal(signal),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Exa API error ${response.status}: ${text.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

interface RestSearchResult {
  title?: string;
  url?: string;
  text?: string;
  highlights?: string[];
  publishedDate?: string;
  author?: string;
}

async function searchWithRest(query: string, options: SearchOptions): Promise<SearchResponse> {
  const apiKey = getApiKey()!;
  const startDate = options.recencyFilter ? recencyToStartDate(options.recencyFilter) : null;
  const body = {
    query,
    type: "auto" as const,
    numResults: options.numResults ?? 5,
    ...mapDomainFilter(options.domainFilter),
    ...(startDate ? { startPublishedDate: startDate } : {}),
    contents: {
      text: true,
      highlights: true,
      ...(options.includeContent ? { textMaxCharacters: 50_000 } : { textMaxCharacters: 1_000 }),
    },
  };
  const data = await exaRest<{ results: RestSearchResult[] }>("/search", body, apiKey, options.signal);

  const results: ExaResult[] = (data.results ?? [])
    .filter((r) => !!r.url)
    .map((r) => ({
      title: r.title || "",
      url: r.url!,
      content: (r.highlights ?? []).filter(Boolean).join(" ") || (r.text ?? "").trim(),
      publishedDate: r.publishedDate,
      author: r.author,
    }));

  return toSearchResponse(results, options.includeContent ?? false);
}

/** Fetch full content for known URLs via Exa's /contents endpoint. */
export async function fetchUrls(
  urls: string[],
  signal?: AbortSignal,
): Promise<{ url: string; title: string; content: string; error?: string }[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return urls.map((url) => ({ url, title: "", content: "", error: "No Exa API key configured" }));
  }
  const data = await exaRest<{ results: RestSearchResult[] }>(
    "/contents",
    { ids: urls, text: true },
    apiKey,
    signal,
  );
  const byUrl = new Map((data.results ?? []).map((r) => [r.url, r]));
  return urls.map((url) => {
    const r = byUrl.get(url);
    return {
      url,
      title: r?.title ?? "",
      content: (r?.text ?? "").trim(),
      error: r ? undefined : "No content returned",
    };
  });
}

// ---------- MCP fallback (no API key required) ----------

async function callExaMcp(toolName: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const response = await fetch(`${EXA_MCP_URL}?tools=${toolName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "x-exa-source": "@kivlor/pi-web-search",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
    signal: requestSignal(signal),
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 429) {
      throw new Error(
        `Exa MCP rate limit reached (429). Add "exaApiKey" to ${getWebSearchConfigPath()} for unthrottled search: ${text.slice(0, 200)}`,
      );
    }
    throw new Error(`Exa MCP error ${response.status}: ${text.slice(0, 300)}`);
  }

  const body = await response.text();
  let parsed: {
    error?: { message?: string; code?: number };
    result?: { isError?: boolean; content?: { type: string; text?: string }[] };
  } | null = null;
  for (const line of body.split("\n").filter((l) => l.startsWith("data:"))) {
    const payload = line.slice(5).trim();
    if (!payload) continue;
    try {
      const candidate = JSON.parse(payload);
      if (candidate?.result || candidate?.error) { parsed = candidate; break; }
    } catch { /* not json */ }
  }
  if (!parsed) {
    try { parsed = JSON.parse(body); } catch { parsed = null; }
  }
  if (!parsed) throw new Error("Exa MCP returned an empty response");
  if (parsed.error) {
    throw new Error(`Exa MCP error${typeof parsed.error.code === "number" ? ` ${parsed.error.code}` : ""}: ${parsed.error.message ?? "Unknown error"}`);
  }
  if (parsed.result?.isError) {
    throw new Error(
      parsed.result.content?.find((c) => c.type === "text")?.text?.trim() || "Exa MCP returned an error",
    );
  }
  const text = parsed.result?.content?.find((c) => c.type === "text" && c.text?.trim())?.text;
  if (!text) throw new Error("Exa MCP returned empty content");
  return text;
}

function parseMcpResults(text: string): ExaResult[] | null {
  // JSON form first: {"results": [{title, url, text, highlights}]}
  try {
    const results = JSON.parse(text).results;
    if (Array.isArray(results) && results.length > 0) {
      return results
        .filter((r: RestSearchResult) => !!r.url)
        .map((r: RestSearchResult) => ({
          title: r.title || "",
          url: r.url!,
          content: (r.highlights ?? []).filter(Boolean).join(" ") || (r.text ?? "").trim(),
        }));
    }
  } catch { /* fall through to text form */ }
  // Text form: "Title: ...\nURL: ...\nText: ...\n---"
  const blocks = text.split(/(?=^Title: )/m).filter((b) => b.trim().length > 0);
  const parsed = blocks
    .map((block) => {
      const title = block.match(/^Title: (.+)/m)?.[1]?.trim() ?? "";
      const url = block.match(/^URL: (.+)/m)?.[1]?.trim() ?? "";
      let content = "";
      const textStart = block.indexOf("\nText: ");
      if (textStart >= 0) {
        content = block.slice(textStart + 7).trim();
      } else {
        const hlMatch = block.match(/\nHighlights:\s*\n/);
        if (hlMatch?.index != null) content = block.slice(hlMatch.index + hlMatch[0].length).trim();
      }
      return { title, url, content: content.replace(/\n---\s*$/, "").trim() };
    })
    .filter((r) => r.url.length > 0);
  return parsed.length > 0 ? parsed : null;
}

async function searchWithMcp(query: string, options: SearchOptions): Promise<SearchResponse> {
  const args = {
    query: buildMcpQuery(query, options),
    numResults: options.numResults ?? 5,
    enableHighlights: true,
  };
  const text = await callExaMcp(EXA_MCP_BASIC_TOOL, args, options.signal);
  const results = parseMcpResults(text);
  if (!results) throw new Error("Exa MCP returned no parseable results");
  return toSearchResponse(results, options.includeContent ?? false);
}

// ---------- shared shaping ----------

function toSearchResponse(results: ExaResult[], includeContent: boolean): SearchResponse {
  const parts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const snippet = r.content.replace(/\s+/g, " ").trim().slice(0, 500);
    if (!snippet) continue;
    parts.push(`${snippet}\nSource: ${r.title || `Source ${i + 1}`} (${r.url})`);
  }
  const response: SearchResponse = {
    answer: parts.join("\n\n"),
    results: results.map((r, i) => ({ title: r.title || `Source ${i + 1}`, url: r.url, snippet: snippetOf(r) })),
  };
  if (includeContent) {
    const inline = results
      .filter((r) => r.content.length > 0)
      .map((r) => ({ url: r.url, title: r.title, content: r.content }));
    if (inline.length) response.inlineContent = inline;
  }
  return response;
}

function snippetOf(r: ExaResult): string {
  return r.content.replace(/\s+/g, " ").trim().slice(0, 300);
}

// ---------- public entry point ----------

export async function searchExa(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
  const apiKey = getApiKey();
  if (apiKey) {
    try {
      return await searchWithRest(query, options);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/abort/i.test(message)) throw err;
      // fall through to MCP on non-abort REST failures
    }
  }
  return await searchWithMcp(query, options);
}

export function isConfigured(): boolean {
  return getApiKey() !== undefined;
}
