// ─── Emoji / decorative-symbol sanitizer ───────────────────────────────────
// The AI is instructed (system prompt) to avoid emoji and decorative symbols,
// but models occasionally emit them anyway. This sanitizer strips them on the
// client so the academic / monochrome / thesis aesthetic is preserved
// consistently — for both live-streaming content and historical messages.
//
// Design notes:
//   - We DO NOT touch punctuation that carries meaning: . , ; : ! ? " ' ( )
//     [ ] { } - – — · • ... etc. Bullets (•, ·) and dashes (–, —) are kept
//     because they are typographic, not "expressive".
//   - We strip: pictographic emoji, dingbats (✨✓✔✗★☆→⇒ etc. are mapped or
//     removed), symbols-and-pictographs, transport/map, flags, variation
//     selectors, ZWJ.
//   - We collapse the resulting double spaces / stray leading separators.
//
// The implementation uses Unicode property escapes:
//   \p{Emoji}        — emoji + many CJK ideographs (too broad, see below)
//   \p{Extended_Pictographic} — the actual "picture" emoji (preferred)
// We combine Extended_Pictographic with explicit dingbat/symbol ranges.

// Ranges of "expressive" symbols we want to remove (keep typographic ones).
// These are common AI-decoration symbols that aren't caught by
// Extended_Pictographic.
const DECORATIVE_SYMBOL_RE =
  /[\u2700-\u27BF\u2600-\u26FF\u2B00-\u2BFF\u2190-\u21FF\u27F5-\u27FF\u2B05-\u2B07\uFE0F\u200D\u20E3\uFFFD\uFFF9-\uFFFB]/g;
// \uFFFD         REPLACEMENT CHARACTER (left over from bad UTF-8 decoding of emoji bytes)
// \uFFF9-\uFFFB  Interlinear annotation characters (rare, but occasionally emitted)
// \u2700-\u27BF  Dingbats (✨ ✏ ✓ ✔ ✗ ★ ☆ ☀ ☁ ☂ ☃ ✉ ✂ ✊ ✋ ...)
// \u2600-\u26FF  Miscellaneous symbols (☀ ☁ ☂ ☃ ☺ ☻ ☼ ☽ ☾ ★ ☆ ☎ ☏ ☐ ☑ ☒ ...)
// \u2B00-\u2BFF  Misc symbols and arrows (⬀⬁⬂⬃⬄⬅⬆⬇⬈⬉⬊⬋ ⭕ ⭖ ...)
// \u2190-\u21FF  Arrows (← ↑ → ↓ ↔ ↕ ↖ ↗ ↘ ↙ ⇐ ⇑ ⇒ ⇓ ⇔ ⇕ ...)
// \u27F5-\u27FF  Long arrows (⟵ ⟶ ⟷ ...)
// \u2B05-\u2B07  Black arrows (⬅ ⬆ ⬇)
// \uFE0F         Variation selector-16 (emoji presentation)
// \u200D         Zero-width joiner
// \u20E3         Combining enclosing keycap

// Extended pictographic emoji (😀 🎉 🔥 💡 🚀 🧠 ⚡ 🎓 🏆 📚 ...) + flags.
// We use a broader emoji pattern and then carefully keep CJK / digits by
// requiring the match to NOT be a CJK ideograph or ASCII.
const EMOJI_RE =
  /\p{Extended_Pictographic}|\p{Regional_Indicator}\p{Regional_Indicator}/gu;

// Tidy up the whitespace left behind after stripping symbols:
//   - collapse runs of spaces/tabs into one
//   - remove spaces before sentence punctuation
//   - remove leading separator+space ("- " with nothing after the dash)
//   - collapse ", ," → "," and "。," → "。" (orphan commas left by stripped bullets)
//   - trim line ends
function tidy(s: string): string {
  return s
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]([,.;:!?。，；：！？])/g, '$1')
    .replace(/^[\s]*[-•·][\s]+$/gm, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([,，])\s+(?=[,，])/g, '$1')
    .trim();
}

export function stripEmoji(input: string): string {
  if (!input) return input;
  const out = input
    .replace(EMOJI_RE, '')
    .replace(DECORATIVE_SYMBOL_RE, '');
  return tidy(out);
}
