/**
 * Stage 1 — normalization.
 *
 * Card text arrives with the typographic debris of two decades of printings:
 * curly quotes, non-breaking spaces, four different dashes, bullet glyphs that
 * vary by set. Every later stage would otherwise need to know about all of
 * them.
 *
 * The hard requirement here is that normalization must be REVERSIBLE in the
 * offset sense. Spans in the output AST point at the original printed text, so
 * a consumer can highlight on the card as printed; but the lexer runs on the
 * normalized text. `NormalizedText` therefore carries `offsets`, a
 * per-character map back to original indices, and `toOriginalSpan` is the only
 * sanctioned way to turn a normalized range into a `Span`.
 *
 * What is deliberately NOT touched: colons, semicolons, parentheses, quotation
 * marks, periods and commas. Those carry PSCT's structural meaning — a colon
 * separates the condition from the activation, a semicolon the cost from the
 * resolution — so normalizing them away would destroy the grammar before the
 * parser ever sees it.
 */

import { DiagnosticCode, DiagnosticSeverity } from './ast';
import type { Diagnostic, Span } from './ast';

export interface NormalizedText {
  original: string;
  normalized: string;
  /**
   * `offsets[i]` is the original-text index of `normalized[i]`. One entry per
   * normalized character, plus a trailing entry so an exclusive end offset at
   * the very end of the string still maps.
   */
  offsets: number[];
  diagnostics: Diagnostic[];
}

/**
 * Single-character substitutions. The replacement may be longer than one
 * character (the ellipsis), in which case every character of the replacement
 * maps back to the single original index.
 */
const CHAR_MAP = new Map<string, string>([
  // Curly quotes. Straight quotes delimit card names, so these must become the
  // same character the lexer looks for.
  ['“', '"'],
  ['”', '"'],
  ['„', '"'],
  ['«', '"'],
  ['»', '"'],
  // Apostrophe variants. "your opponent's" shows up with at least three.
  ['‘', "'"],
  ['’', "'"],
  ['‚', "'"],
  ['`', "'"],
  ['´', "'"],
  ['ʼ', "'"],
  // Dash variants. Card text uses these in ranges ("Level 1-4") and in names.
  ['‐', '-'],
  ['‑', '-'],
  ['‒', '-'],
  ['–', '-'],
  ['—', '-'],
  ['―', '-'],
  ['−', '-'],
  // Bullet glyphs. Link and multi-effect monsters use several; segmentation
  // keys on exactly one.
  ['•', '●'],
  ['・', '●'],
  ['⚫', '●'],
  ['▪', '●'],
  // Expands to three characters, all mapping back to the one original index.
  ['…', '...'],
]);

/** Whitespace, including the exotic spaces that appear in scanned text. */
const WHITESPACE_RE = /[\s   -    　﻿]/;

/** The bullet every variant is normalized to. */
export const BULLET = '●';

/**
 * Normalize card text, keeping a map back to the original offsets.
 *
 * Whitespace runs — including line breaks, which printings insert at arbitrary
 * points — collapse to a single space. Collapsing changes offsets, which is
 * precisely why the offset map exists.
 */
export function normalize(original: string): NormalizedText {
  const out: string[] = [];
  const offsets: number[] = [];

  let i = 0;
  /** True while the only thing emitted so far is leading whitespace. */
  let atStart = true;
  /** Whether anything beyond whitespace collapsing was rewritten. */
  let substantiveChange = false;

  while (i < original.length) {
    const ch = original[i];

    if (WHITESPACE_RE.test(ch)) {
      // Collapse the whole run. Leading whitespace is dropped outright, which
      // is why `atStart` is tracked rather than trimming afterwards — trimming
      // later would invalidate every offset already recorded.
      let j = i;
      let hasNewline = false;
      while (j < original.length && WHITESPACE_RE.test(original[j])) {
        if (original[j] === '\n' || original[j] === '\r') hasNewline = true;
        j++;
      }
      if (!atStart) {
        // A run containing a line break collapses to a single newline rather
        // than a space, because the break is sometimes STRUCTURAL: Extra Deck
        // cards print their materials line, a line break, then the effect text,
        // with no period between them. Collapsing it to a space merges the two
        // into one sentence, and the materials-line rule then discards the real
        // effect along with it. Mid-sentence line wraps also exist (~2k cards),
        // so `structure.ts` decides which breaks are boundaries — this stage
        // only preserves the distinction.
        out.push(hasNewline ? '\n' : ' ');
        offsets.push(i);
      }
      i = j;
      continue;
    }

    const replacement = CHAR_MAP.get(ch);
    if (replacement !== undefined) {
      for (const rc of replacement) {
        out.push(rc);
        offsets.push(i);
      }
      substantiveChange = true;
      atStart = false;
      i += 1;
      continue;
    }

    out.push(ch);
    offsets.push(i);
    atStart = false;
    i += 1;
  }

  // Drop trailing separator characters left behind by a collapsed trailing run.
  while (
    out.length &&
    (out[out.length - 1] === ' ' || out[out.length - 1] === '\n')
  ) {
    out.pop();
    offsets.pop();
  }

  const normalized = out.join('');
  // The trailing sentinel lets an exclusive end offset equal to the string
  // length map to just past the last original character.
  offsets.push(
    normalized.length === 0 ? 0 : (offsets[offsets.length - 1] ?? 0) + 1,
  );

  const diagnostics: Diagnostic[] = [];
  if (substantiveChange) {
    // Reported at `info` only, and only for rewrites beyond whitespace
    // collapsing — a warning on every card with a curly quote would be noise
    // that buries the diagnostics that matter.
    diagnostics.push({
      severity: DiagnosticSeverity.INFO,
      code: DiagnosticCode.NORMALIZATION_CHANGED_TEXT,
      message: 'Typographic characters were rewritten before parsing.',
      span: null,
    });
  }

  return { original, normalized, offsets, diagnostics };
}

/**
 * Turn a half-open range of the NORMALIZED text into a span of the ORIGINAL
 * text.
 *
 * `text` is sliced from the original, so what a consumer highlights is exactly
 * what was printed — curly quotes and all — rather than the parser's cleaned-up
 * version.
 */
export function toOriginalSpan(
  nt: NormalizedText,
  normalizedStart: number,
  normalizedEnd: number,
): Span {
  const clampedStart = Math.max(
    0,
    Math.min(normalizedStart, nt.normalized.length),
  );
  const clampedEnd = Math.max(
    clampedStart,
    Math.min(normalizedEnd, nt.normalized.length),
  );

  const start = nt.offsets[clampedStart] ?? nt.original.length;
  // An exclusive end maps through the offset of the character at `end`, which
  // for a range ending at the last character is the trailing sentinel.
  const end = nt.offsets[clampedEnd] ?? nt.original.length;

  return {
    start,
    end,
    text: nt.original.slice(start, end),
  };
}
