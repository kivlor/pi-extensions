# @kivlor/pi-web-search

Web search for the Pi coding agent, powered by Exa. Pure TypeScript, no build step.

## Tools

- **`web_search`** — search the web with Exa. Single `query` or up to 4
  varied `queries` run concurrently; optional `numResults`, `includeContent`,
  `recencyFilter` (day/week/month/year), `domainFilter` (`-domain` excludes).
- **`web_fetch`** — fetch full text content for known URLs via Exa's
  `/contents` endpoint (up to 10 per call).

## Command

- **`/websearch`** — show Exa configuration status.

## Configuration

Resolution order:

1. `exaApiKey` in `~/.pi/agent/web-search.json`
2. `EXA_API_KEY` environment variable

With a key, searches hit the Exa REST API (`api.exa.ai`, override with
`exaBaseUrl` in config or `EXA_BASE_URL`). Without a key, they fall back to
the free Exa MCP endpoint (`mcp.exa.ai`), which is rate-limited (429s).

## Install

```bash
pi install @kivlor/pi-web-search
```

## Dev loop

```bash
pi -ne --extension extensions/web-search/index.ts -p "search the web for ..."
```

(`-ne` disables installed packages to avoid tool-name conflicts with any
other package that registers `web_search`.)
