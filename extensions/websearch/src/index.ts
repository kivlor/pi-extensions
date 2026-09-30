/**
 * @kivlor/pi-web-search — entry point.
 *
 * Registers:
 *   - `web_search` tool: Exa-backed search (single or multi-query)
 *   - `web_fetch` tool: known-URL content fetch via Exa /contents
 *   - `/websearch` command: show Exa config status
 *
 * Exa REST (api.exa.ai) is the backbone; without an API key it falls back
 * to the free Exa MCP endpoint (mcp.exa.ai), like pi-web-access does.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { webSearchTool, webFetchTool } from "./tools.ts";
import { isConfigured, getWebSearchConfigPath, getApiBaseUrl } from "./exa.ts";

export default function webSearch(pi: ExtensionAPI): void {
  pi.registerTool(webSearchTool);
  pi.registerTool(webFetchTool);

  pi.registerCommand("websearch", {
    description: "Show Exa web-search configuration status",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const configured = isConfigured();
      ctx.ui.notify(
        [
          `Exa API key: ${configured ? "configured" : "not set (using free MCP fallback)"}`,
          `API base URL: ${getApiBaseUrl()}`,
          `Config file: ${getWebSearchConfigPath()}`,
          "",
          configured
            ? 'Set "exaApiKey" there or EXA_API_KEY to switch keys; EXA_BASE_URL overrides the API endpoint.'
            : `Add {"exaApiKey": "..."} to ${getWebSearchConfigPath()} for unthrottled REST search.`,
        ].join("\n"),
        "info",
      );
    },
  });
}
