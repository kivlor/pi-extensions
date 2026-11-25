# AGENTS.md

This repo is a suite of pi extensions. Before adding or changing an extension,
read one or two existing ones (`extensions/*/`) to learn the conventions, and
follow them.

## Conventions

- Each extension lives in `extensions/<name>/` as a self-contained package of
  raw TypeScript that pi loads directly — no build step, no compiled artifacts.
- Stick to the patterns used by the current extensions: `index.ts` entry point,
  implementation in `src/`, `package.json` scoped as `@kivlor/pi-<name>`.

## Extension README

Every extension gets its own README, written in the same style as the others:

1. `# @kivlor/pi-<name>` title
2. One-line description
3. `## Install` — `pi install npm:@kivlor/pi-<name>` code block (the `npm:`
   prefix is required for namespaced npm packages), followed by the
   `--local`/`-l` note (copy it verbatim from an existing README)
4. Then as applicable: `## Tools`, `## Commands`, `## What it does`,
   `## Configuration` / `## Usage`

## Local installs (dev machine)

Extensions and skills on the dev machine are deliberately wired as **symlinks**
(`~/.pi/agent/extensions/<name>` and `~/.pi/agent/skills/<skill>`) pointing
into this checkout, so every repo edit is live on the next pi `/reload` —
no reinstall. They are legacy-dir installs, not declared packages, so `pi.*`
manifest keys (`skills`, `prompts`, …) only apply to npm installs. Do not
migrate them to package declarations or replace the symlinks unless asked.

## Root README

When adding a new extension, update the root `README.md`:

- Add a row to the `## Extensions` table (name, path, one-line summary)
- Add the package to the `## Install` code block

If you remove or rename an extension, update both sections accordingly.
