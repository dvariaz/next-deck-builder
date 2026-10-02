/**
 * Stage 1 — text normalization and quoted-name masking.
 *
 * The single most important decision in the parser lives here: card names are
 * masked out of the text BEFORE any other rule runs.
 *
 * Card names contain every token the later stages key on — "Deck Devastation
 * Virus" contains "Deck", "Number 39: Utopia" contains a colon that would break
 * PSCT clause splitting, "D.D. Crow" contains periods that would break sentence
 * splitting, and "Elemental HERO Sunrise" contains an archetype. Masking them
 * first eliminates that entire class of false positive structurally, instead of
 * chasing each case with a negative lookahead.
 */

/**
 * U+0001 START OF HEADING. Chosen as the mask delimiter because it appears in
 * no card text and is not a regex metacharacter, so mask tokens can be matched
 * and split around without escaping.
 */
const D = '\u0001';

/** Matches a mask token and captures its index. */
export const MASK_RE = /\u0001Q(\d+)\u0001/g;

/** Bounded to 80 chars so an unbalanced quote cannot swallow the whole card. */
const QUOTED_RE = /"([^"]{1,80})"/g;

export interface MaskedText {
  /** Text with every `"Card Name"` replaced by a mask token. */
  masked: string;
  /** Names by index; `names[n]` corresponds to the token `Q<n>`. */
  names: string[];
}

/**
 * Unicode quote characters → ASCII. Must run BEFORE masking, or curly-quoted
 * names would not be masked at all.
 *
 * (The current pool has zero smart quotes, but YGOProDeck has changed its
 * encoding before and this costs nothing.)
 */
export function normalizeQuoteChars(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"');
}

/** Replace every quoted card name with an opaque token. */
export function maskQuotes(text: string): MaskedText {
  const names: string[] = [];
  const masked = text.replace(QUOTED_RE, (_full, name: string) => {
    names.push(name);
    return `${D}Q${names.length - 1}${D}`;
  });
  return { masked, names };
}

/** Restore masked names, re-adding the quotes. */
export function unmask(text: string, names: string[]): string {
  return text.replace(MASK_RE, (full, index: string) => {
    const name = names[Number(index)];
    return name === undefined ? full : `"${name}"`;
  });
}

/** Restore masked names without quotes — for building display labels. */
export function unmaskBare(text: string, names: string[]): string {
  return text.replace(MASK_RE, (full, index: string) => {
    const name = names[Number(index)];
    return name === undefined ? full : name;
  });
}

/**
 * The mask index at the very start of a fragment, ignoring leading spaces.
 *
 * Lets a rule anchor on "the quoted name comes FIRST" without embedding the
 * delimiter in its own pattern: "name becomes <name>" is an alias, while
 * "name becomes that monster's name ... Summon 1 <name>" is not.
 */
export function leadingMaskIndex(text: string): number | undefined {
  const match = /^\s*\u0001Q(\d+)\u0001/.exec(text);
  return match ? Number(match[1]) : undefined;
}

/** Every mask token index appearing in a fragment, in order. */
export function maskedNameIndexes(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(MASK_RE)) out.push(Number(m[1]));
  return out;
}

/** Resolve a fragment's mask tokens to the names they stand for. */
export function maskedNames(text: string, names: string[]): string[] {
  return maskedNameIndexes(text)
    .map((i) => names[i])
    .filter((n): n is string => n !== undefined);
}

/**
 * Everything that must run AFTER masking, because it would otherwise rewrite
 * the inside of a card name (e.g. "Fairy Tail - Snow"'s dash, or the literal
 * card "The Graveyard of Wandering Souls").
 */
export function normalizeRest(text: string): string {
  return (
    text
      // dash variants → ASCII hyphen
      .replace(/[\u2013\u2014\u2212]/g, '-')
      // exotic spaces → plain space
      .replace(/[\u00A0\u2007\u202F]/g, ' ')
      // bullet variants → the canonical one YGOProDeck uses (U+25CF)
      .replace(/[\u2022\u00B7\u25E6]/g, '\u25CF')
      // Older printings spell out "Graveyard"; modern PSCT uses "GY".
      .replace(/\bGraveyard\b/g, 'GY')
      // A line that does not end in sentence punctuation is still a sentence
      // boundary, so give it one before the newlines are collapsed.
      //
      // This is the Extra Deck materials line: "2 Level 4 monsters", "1 Tuner
      // + 1+ non-Tuner monsters", '"Robolady" + "Roboyarou"'. 2,563 cards in
      // the pool have one, and it is never a mid-sentence wrap — verified
      // across the whole pool, where every unpunctuated newline is either this
      // line or a bracketed block header.
      //
      // Without the boundary the materials line merges into the card's first
      // effect sentence, which is actively harmful rather than merely untidy:
      // "2 Level 4 monsters Cannot attack unless it has Xyz Material" would
      // let a predicate parsed from that sentence pick up Level 4 from the
      // material requirement.
      .replace(/([^.?!\]\u25cf\s])[ \t]*\r?\n+[ \t]*(?!\u25cf)/g, '$1. ')
      // Collapse the remaining whitespace, including the newlines around
      // bullet lines and [ Pendulum Effect ] headers, which segmentation
      // splits on as explicit markers rather than on newlines.
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * The full stage-1 pipeline, in the one order that is correct:
 * unicode quotes → mask names → normalize everything else.
 */
export function preprocess(description: string): MaskedText {
  const { masked, names } = maskQuotes(normalizeQuoteChars(description));
  return { masked: normalizeRest(masked), names };
}
