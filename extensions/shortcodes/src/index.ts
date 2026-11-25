/**
 * @kivlor/pi-shortcodes — entry point.
 *
 * Converts Slack-style emoji shortcodes (:smile:, :thumbsup:, :tada:) to the
 * corresponding Unicode emoji when a message is submitted, via the `input`
 * event's `transform` action. Works in every input source (interactive, RPC,
 * extension) and chains cleanly with other input handlers.
 *
 * Unknown shortcodes are left untouched, so things like `12:30:`, URLs, or
 * custom workspace emoji pass through unchanged. No state, no I/O, no
 * dependencies beyond pi's own packages.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SHORTCODES } from "./shortcodes.ts";

/**
 * Shortcode pattern: `:name:` where name is lowercase letters, digits,
 * underscore, `+`, `-`, or `'` (the character set gemoji aliases actually
 * use, including `+1`, `-1`, `t-rex`, `e-mail`, `non-potable_water`).
 */
const SHORTCODE_RE = /:([a-z0-9_'+-]+):/g;

/**
 * Replace every known `:shortcode:` in `text` with its emoji.
 * Unknown shortcodes are returned unchanged.
 */
export function replaceShortcodes(text: string): string {
  return text.replace(SHORTCODE_RE, (match, name: string) => SHORTCODES[name] ?? match);
}

export default function emojiShortcodes(pi: ExtensionAPI): void {
  pi.on("input", async (event) => {
    if (!event.text) return { action: "continue" };
    const text = replaceShortcodes(event.text);
    return text === event.text ? { action: "continue" } : { action: "transform", text };
  });
}
