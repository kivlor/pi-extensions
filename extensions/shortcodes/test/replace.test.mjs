/**
 * Tests for the shortcode replacement logic (pure functions only).
 */

import { strict as assert } from "node:assert";
import { replaceShortcodes } from "../src/index.ts";
import { SHORTCODES } from "../src/shortcodes.ts";

// === replaceShortcodes ===

assert.equal(replaceShortcodes(":smile:"), "😄");
assert.equal(replaceShortcodes("hey :smile:"), "hey 😄");
assert.equal(replaceShortcodes(":smile::fire:"), "😄🔥");
assert.equal(replaceShortcodes(":thumbsup: :tada: ship it :rocket:"), "👍 🎉 ship it 🚀");
assert.equal(replaceShortcodes(":+1: and :-1:"), "👍 and 👎");
assert.equal(replaceShortcodes(":t-rex: :e-mail: :non-potable_water:"), "🦖 📧 🚱");

// unknown / near-miss shortcodes pass through
assert.equal(replaceShortcodes(":trollface:"), ":trollface:");
assert.equal(replaceShortcodes("meet at 12:30: ok?"), "meet at 12:30: ok?");
assert.equal(replaceShortcodes("https://example.com/:nothing:"), "https://example.com/:nothing:");
assert.equal(replaceShortcodes("no shortcodes here"), "no shortcodes here");
assert.equal(replaceShortcodes("::"), "::");
assert.equal(replaceShortcodes(""), "");

// mixed with surrounding text and punctuation
assert.equal(replaceShortcodes("LGTM :white_check_mark:"), "LGTM ✅");
assert.equal(replaceShortcodes("line1\n:eyes: line2"), "line1\n👀 line2");

// === SHORTCODES map sanity ===

assert.ok(Object.keys(SHORTCODES).length > 1800);
assert.equal(SHORTCODES["smile"], "😄");
assert.equal(SHORTCODES["joy"], "😂");
assert.equal(SHORTCODES["thinking_face"], "🤔");

console.log("✓ shortcodes tests passed");
