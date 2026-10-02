import type { EffectBlockKind } from './card-effect.types';

/**
 * Stage 2 — segmentation of masked card text into independent effect blocks
 * and then into sentences.
 *
 * Runs on MASKED text, so card names containing periods ("D.D. Crow"), colons
 * ("Number 39: Utopia") or the word "Effect" cannot influence any split.
 */

/**
 * Pendulum cards carry two independent effect bodies separated by bracketed
 * headers. Verified against the pool: 374 cards use these headers and ZERO use
 * a dashed separator, so there is no dash rule to write.
 */
const BLOCK_HEADER_RE = /\[\s*(Pendulum|Monster)\s+Effect\s*\]/gi;

/** U+25CF, normalized from all bullet variants in stage 1. */
const BULLET = '●';

/**
 * A handtrap idiom: the bullets after this lead-in QUOTE effects the card
 * negates, they are not effects you perform. Ash Blossom is the canonical
 * example — its bullets read "Add a card from the Deck to the hand", which is
 * a description of what it stops, not something it does.
 *
 * Rare (2 cards in the current pool) but they are exactly the cards a naive
 * parser gets spectacularly wrong, and the guard costs one regex.
 */
const QUOTED_EFFECTS_RE =
  /\b(?:includes?|include)\s+any\s+of\s+(?:these|the following)\s+effects\b/i;

/**
 * Sentence boundary: a period followed by whitespace and something that can
 * begin a sentence — a capital, a mask token (a quoted name), or an opening
 * parenthesis ("(Quick Effect):").
 *
 * The lookbehind also accepts ".)", because a parenthetical sentence is a
 * standard PSCT device that closes AFTER its period: Gladiator Beast
 * Heraklinos' "(You do not use "Polymerization".) During either player's
 * turn, ..." is two sentences, and without this its Summon condition and the
 * trigger that follows it are read as a single clause.
 *
 * Safe because every abbreviation in card text lives inside a card name, and
 * card names are masked before this runs.
 */
const SENTENCE_SPLIT_RE = /(?<=\.|\.\))\s+(?=[A-Z(])/;

export interface EffectBlock {
  /** Position among all blocks; used to build stable effect ids. */
  index: number;
  kind: EffectBlockKind;
  /** The block's own text (masked). */
  text: string;
  /**
   * For BULLET blocks: the text preceding the bullet list, which carries the
   * governing trigger and cost. "You can discard 1 card, then activate 1 of
   * these effects;" applies its discard cost to whichever bullet is chosen.
   */
  leadIn?: string;
  /** True when `leadIn` marks the bullets as quoted effects, not instructions. */
  quotedEffects: boolean;
}

/** Split the pendulum/monster halves apart, preserving which is which. */
function splitNamedBlocks(
  masked: string,
): { kind: EffectBlockKind; text: string }[] {
  const parts = masked.split(BLOCK_HEADER_RE);

  // No headers: split() returns the whole string as a single element.
  if (parts.length === 1) {
    return [{ kind: 'MAIN', text: masked }];
  }

  const blocks: { kind: EffectBlockKind; text: string }[] = [];

  // parts = [preamble, 'Pendulum', body, 'Monster', body, ...]
  const preamble = parts[0]?.trim();
  if (preamble) blocks.push({ kind: 'MAIN', text: preamble });

  for (let i = 1; i < parts.length; i += 2) {
    const label = parts[i]?.toLowerCase();
    const body = parts[i + 1]?.trim();
    if (!body) continue;
    blocks.push({
      kind: label === 'pendulum' ? 'PENDULUM' : 'MONSTER',
      text: body,
    });
  }

  return blocks;
}

/**
 * Split masked card text into effect blocks.
 *
 * Bullet lists become one BULLET block per bullet, each carrying the shared
 * lead-in, so a cost stated once before the list is not lost and is not
 * double-counted across bullets.
 */
export function splitBlocks(masked: string): EffectBlock[] {
  const blocks: EffectBlock[] = [];
  let index = 0;

  for (const { kind, text } of splitNamedBlocks(masked)) {
    if (!text.includes(BULLET)) {
      const trimmed = text.trim();
      if (trimmed) {
        blocks.push({
          index: index++,
          kind,
          text: trimmed,
          quotedEffects: false,
        });
      }
      continue;
    }

    const [rawLeadIn = '', ...bullets] = text.split(BULLET);
    const leadIn = rawLeadIn.trim();
    const quotedEffects = QUOTED_EFFECTS_RE.test(leadIn);

    // The lead-in is itself an effect body when it does more than introduce the
    // list (Ash Blossom's "You can discard this card; negate that effect.").
    if (leadIn) {
      blocks.push({ index: index++, kind, text: leadIn, quotedEffects: false });
    }

    for (const bullet of bullets) {
      const trimmed = bullet.trim();
      if (!trimmed) continue;
      blocks.push({
        index: index++,
        kind: 'BULLET',
        text: trimmed,
        leadIn: leadIn || undefined,
        quotedEffects,
      });
    }
  }

  return blocks;
}

/** Split a block into sentences. */
export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT_RE)
    .map((s) => s.trim())
    .filter(Boolean);
}
