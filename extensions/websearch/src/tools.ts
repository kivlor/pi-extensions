/**
 * Tool definitions: `web_search` (Exa search, multi-query) and `web_fetch`
 * (known-URL content fetch via Exa /contents). Mirrors the shape of
 * pi-web-access's webSearch/fetch tools, Exa-only.
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { searchExa, fetchUrls, type SearchResponse } from "./exa.ts";

const MAX_QUERIES = 4;

function formatSearchOutput(query: string, response: SearchResponse): string {
  const lines: string[] = [`# Results for: ${query}`];
  if (response.answer) lines.push("", response.answer);
  if (response.results.length) {
    lines.push("", "## Sources");
    for (const r of response.results) lines.push(`- ${r.title} — ${r.url}`);
  }
  return lines.join("\n");
}

export const webSearchTool = defineTool({
  name: "web_search",
  label: "Web Search",
  description:
    "Search the web with Exa. Accepts a single query or, for research tasks, " +
    "2-4 varied queries run concurrently for broader coverage. Returns source-linked " +
    "results with snippets; set includeContent to also return full page text.",
  promptSnippet:
    "Use for web research questions. Prefer {queries:[...]} with 2-4 varied angles over a single query.",
  parameters: Type.Object({
    query: Type.Optional(Type.String({ description: "Single search query. For research, prefer 'queries' with multiple varied angles." })),
    queries: Type.Optional(
      Type.Array(Type.String(), {
        description:
          "Multiple queries searched concurrently (up to 4). Vary phrasing, scope, and angle. " +
          "Good: ['pi coding agent extensions guide', 'pi ExtensionAPI registerTool examples']. " +
          "Bad: ['pi extensions', 'pi extensions', 'pi extension info'].",
      }),
    ),
    numResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, description: "Results per query (default 5, max 20)" })),
    includeContent: Type.Optional(Type.Boolean({ description: "Also return full page content for each result" })),
    recencyFilter: Type.Optional(
      Type.Unsafe<"day" | "week" | "month" | "year">(
        Type.String({ enum: ["day", "week", "month", "year"], description: "Filter by recency" }),
      ),
    ),
    domainFilter: Type.Optional(
      Type.Array(Type.String(), { description: "Limit to domains (prefix with - to exclude)" }),
    ),
  }),

  async execute(toolCallId, params, signal, onUpdate) {
    const queryList = (
      Array.isArray(params.queries) ? params.queries : params.query ? [params.query] : []
    ).map((q) => q.trim()).filter(Boolean).slice(0, MAX_QUERIES);

    if (queryList.length === 0) {
      return {
        content: [{ type: "text", text: "Error: No query provided. Use 'query' or 'queries'." }],
        details: { error: "No query provided" },
      };
    }

    const results = await Promise.allSettled(
      queryList.map(async (query, i) => {
        // onUpdate partials MUST carry a `content` array: the TUI renders
        // result.content directly and crashes on a content-less payload.
        onUpdate({ content: [{ type: "text", text: `Searching (${i + 1}/${queryList.length}): ${query}` }] });
        const response = await searchExa(query, {
          numResults: params.numResults,
          includeContent: params.includeContent ?? false,
          recencyFilter: params.recencyFilter,
          domainFilter: params.domainFilter,
          signal,
        });
        return formatSearchOutput(query, response);
      }),
    );

    const sections = results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : `# Results for: ${queryList[i]}\n\nSearch failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
    );

    return {
      content: [{ type: "text", text: sections.join("\n\n---\n\n") }],
      details: { provider: "exa", queries: queryList },
    };
  },
});

export const webFetchTool = defineTool({
  name: "web_fetch",
  label: "Web Fetch",
  description:
    "Fetch the text content of known URLs via Exa's contents endpoint. " +
    "Use after web_search to read a full page, or directly with URLs you already have.",
  promptSnippet: "Use to read full page content for specific URLs.",
  parameters: Type.Object({
    urls: Type.Array(Type.String(), {
      description: "One or more URLs to fetch (max 10)",
      maxItems: 10,
    }),
  }),

  async execute(toolCallId, params, signal, onUpdate) {
    const urls = params.urls.map((u) => u.trim()).filter(Boolean).slice(0, 10);
    if (urls.length === 0) {
      return {
        content: [{ type: "text", text: "Error: No URLs provided." }],
        details: { error: "No URLs provided" },
      };
    }
    onUpdate({ content: [{ type: "text", text: `Fetching ${urls.length} URL${urls.length === 1 ? "" : "s"}…` }] });
    const pages = await fetchUrls(urls, signal);
    const sections = pages.map((p) =>
      p.error
        ? `# ${p.url}\n\nFetch failed: ${p.error}`
        : `# ${p.title || p.url}\n\nURL: ${p.url}\n\n${p.content || "(empty page)"}`,
    );
    return {
      content: [{ type: "text", text: sections.join("\n\n---\n\n") }],
      details: { fetched: pages.map((p) => ({ url: p.url, ok: !p.error })) },
    };
  },
});
