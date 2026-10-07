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
3. `## Install` — `pi install @kivlor/pi-<name>` code block, followed by the
   `--local`/`-l` note (copy it verbatim from an existing README)
4. Then as applicable: `## Tools`, `## Commands`, `## What it does`,
   `## Configuration` / `## Usage`

## Root README

When adding a new extension, update the root `README.md`:

- Add a row to the `## Extensions` table (name, path, one-line summary)
- Add the package to the `## Install` code block

If you remove or rename an extension, update both sections accordingly.
