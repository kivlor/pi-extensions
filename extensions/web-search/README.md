# @kivlor/pi-web-search

Exa-backed web search for the Pi coding agent — raw TypeScript, loaded
directly via jiti, no build step. Mirrors the Exa lane of `pi-web-access`
with a much smaller footprint.

## Tools

- **`web_search`** — search the web with Exa. Single `query` or up to 4
  varied `queries` run concurrently; optional `numResults`, `includeContent`,
  `recencyFilter` (day/week/month/year), `domainFilter` (`-domain` excludes).
- **`web_fetch`** — fetch full text content for known URLs via Exa's
  `/contents` endpoint (up to 10 per call).

## Command

- **`/websearch`** — show Exa configuration status.

## Configuration

Resolution order (same as pi-web-access):

1. `exaApiKey` in `~/.pi/agent/web-search.json`
2. `EXA_API_KEY` environment variable

With a key, searches hit the Exa REST API (`api.exa.ai`, override with
`exaBaseUrl` in config or `EXA_BASE_URL`). Without a key, they fall back to
the free Exa MCP endpoint (`mcp.exa.ai`), which is rate-limited (429s).

## Install

```bash
pi install ~/Code/pi-extensions/extensions/web-search
```

## Dev loop

```bash
pi -ne --extension extensions/web-search/index.ts -p "search the web for ..."
```

(`-ne` disables installed packages to avoid tool-name conflicts with
`pi-web-access`, which also registers `web_search`.)
