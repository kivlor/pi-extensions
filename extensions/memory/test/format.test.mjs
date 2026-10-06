/**
 * Tests for format.ts pure helpers
 */

import { strict as assert } from "node:assert";
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
} from "../src/format.ts";

// === todayISO ===
assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
assert.match(todayISO(new Date("2024-01-15T12:00:00Z")), /^2024-01-15$/);

// === formatEntry ===
assert.equal(formatEntry("Simple entry"), "- Simple entry");
assert.equal(
  formatEntry("Entry with source", { source: "session-123" }),
  "- Entry with source [source: session-123]"
);
assert.equal(
  formatEntry("Full meta", { source: "s1", added: "2024-01-01" }),
  "- Full meta [source: s1; added: 2024-01-01]"
);
assert.equal(
  formatEntry("Extras", { extra: { foo: "bar", baz: "qux" } }),
  "- Extras [foo: bar; baz: qux]"
);
assert.equal(
  formatEntry("All", { source: "s", added: "2024-01-01", extra: { x: "1" } }),
  "- All [source: s; added: 2024-01-01; x: 1]"
);

// === findEntryLine ===
const lines = ["- First entry", "- Second entry", "- Third entry"];
assert.equal(findEntryLine(lines, "Second"), 1);
assert.equal(findEntryLine(lines, "Third"), 2);
assert.equal(findEntryLine(lines, "First"), 0);
assert.equal(findEntryLine(lines, "not found"), -1);
assert.equal(findEntryLine(lines, ""), -1);

// === insertEntry ===
const memoryContent = `# Agent Memory

${INDEX_HEADING}
- [[preferences]]
`;

// In MEMORY.md, insert above ## Index
const inserted = insertEntry(memoryContent, "- New entry", true);
const insertedLines = inserted.split("\n");
const idxIdx = insertedLines.findIndex((l) => l.trim() === INDEX_HEADING);
assert.ok(idxIdx > 0);
// Entry should be somewhere before ## Index
const entryIdx = insertedLines.findIndex((l) => l.startsWith("- New entry"));
assert.ok(entryIdx >= 0 && entryIdx < idxIdx);

// Non-MEMORY.md appends at end
const otherContent = `# Preferences\n\n- First pref\n`;
const appended = insertEntry(otherContent, "- Second pref", false);
assert.ok(appended.endsWith("- Second pref\n"));
assert.ok(appended.includes("- First pref"));

// === linkPathForFile ===
assert.equal(linkPathForFile("preferences.md"), "preferences");
assert.equal(linkPathForFile("notes/cooking.md"), "notes/cooking");
assert.equal(linkPathForFile("data.json"), "data.json");

// === upsertIndexLink ===
const emptyMemory = `# Agent Memory\n\n${INDEX_HEADING}\n`;
const { content: withLink, changed } = upsertIndexLink(emptyMemory, "preferences");
assert.ok(changed);
assert.ok(withLink.includes("- [[preferences]]"));
assert.ok(withLink.includes(INDEX_HEADING));

// Already indexed -> no change
const { content: unchanged, changed: notChanged } = upsertIndexLink(withLink, "preferences");
assert.ok(!notChanged);
assert.equal(unchanged, withLink);

// Missing ## Index -> creates it
const noIndex = "# Agent Memory\n";
const { content: withIndex } = upsertIndexLink(noIndex, "topic");
assert.ok(withIndex.includes(INDEX_HEADING));
assert.ok(withIndex.includes("- [[topic]]"));

// === stripLinkBrackets ===
assert.equal(stripLinkBrackets("[[path]]"), "path");
assert.equal(stripLinkBrackets("[[ path ]]"), "path");
assert.equal(stripLinkBrackets("path"), "path");
assert.equal(stripLinkBrackets("[[incomplete"), "[[incomplete");

// === sanitizeRelPath ===
assert.equal(sanitizeRelPath("preferences"), "preferences");
assert.equal(sanitizeRelPath("notes/cooking"), "notes/cooking");
assert.equal(sanitizeRelPath("[[preferences]]"), "preferences");
assert.equal(sanitizeRelPath("/absolute"), null); // rejected: absolute
assert.equal(sanitizeRelPath("../escape"), null); // rejected: ..
assert.equal(sanitizeRelPath("foo/../bar"), null); // rejected: ..
assert.equal(sanitizeRelPath("C:\\Windows"), null); // rejected: backslash
assert.equal(sanitizeRelPath(""), null);
assert.equal(sanitizeRelPath("."), null);
assert.equal(sanitizeRelPath("./"), null);

// === resolveLinkPath ===
const exists = (p) => ["MEMORY.md", "preferences.md", "notes/cooking.md"].includes(p);

// MEMORY resolves to MEMORY.md
assert.deepEqual(resolveLinkPath("MEMORY", exists), { path: "MEMORY.md", tried: ["MEMORY.md"] });
assert.deepEqual(resolveLinkPath("memory", exists), { path: "MEMORY.md", tried: ["MEMORY.md"] });

// preferences -> preferences.md
assert.deepEqual(resolveLinkPath("preferences", exists), { path: "preferences.md", tried: ["preferences", "preferences.md"] });

// Exact match
assert.deepEqual(resolveLinkPath("notes/cooking.md", exists), { path: "notes/cooking.md", tried: ["notes/cooking.md"] });

// Not found
assert.deepEqual(resolveLinkPath("missing", exists), { path: null, tried: ["missing", "missing.md"] });

console.log("✓ format.test.mjs passed");
