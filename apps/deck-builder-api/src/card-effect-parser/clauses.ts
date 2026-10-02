/**
 * Stage 3 — Problem-Solving Card Text (PSCT) clause splitting.
 *
 * Konami's card text follows a fixed grammar:
 *
 *     <activation condition> : <cost> ; <resolution effect>
 *
 * with the resolution further chained by ", also", ", then", ", and if you do",
 * ", after that" and ", but".
 *
 * Splitting on that grammar rather than on sentences buys three correctness
 * properties for free, without a single guard regex:
 *
 *  1. Trigger conditions never become actions. Sangan's "If this card is sent
 *     from the field to the GY:" contains both "sent" and "GY" but lives in the
 *     trigger, which the action matcher never sees.
 *
 *  2. Costs never become actions. One for One's "Send 1 monster from your hand
 *     to the GY;" is a cost, and lands in `cost` because it precedes the
 *     semicolon.
 *
 *  3. Trailing restrictions are isolated. Sangan's ", but you cannot activate
 *     cards ... with that name" becomes its own resolution segment, so the
 *     negation guard kills only that segment instead of eating the search that
 *     precedes it. 940 cards in the pool contain ", but" — without this split
 *     the parser would lose all of their real effects.
 *
 * Operates on MASKED text, so colons and semicolons inside card names
 * ("Number 39: Utopia") cannot split anything.
 */

/**
 * Resolution chaining. Deliberately excludes bare "or" and bare "and", which
 * join noun phrases ("1 Warrior or Spellcaster monster") far more often than
 * they join clauses.
 */
const RESOLUTION_SPLIT_RE =
  /,\s*(?:also|then|but|after that|and if you do)\b,?\s*/gi;

/** "You can ..." marks an optional effect rather than a mandatory one. */
const OPTIONAL_RE = /\byou can\b/i;

export interface PsctClause {
  /** Text before the colon. Never yields actions. */
  trigger?: string;
  /** Text between the colon and the semicolon — paid, not performed. */
  cost?: string;
  /** Text after the semicolon, split into chained segments. */
  resolutions: string[];
  optional: boolean;
  sourceText: string;
}

/** Split a resolution body into its chained segments. */
export function splitResolutions(text: string): string[] {
  return text
    .split(RESOLUTION_SPLIT_RE)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Split one sentence into its PSCT parts.
 *
 * A sentence with neither colon nor semicolon is all resolution — most vanilla
 * Spells read that way ("Add 1 Level 4 or lower Warrior monster from your Deck
 * to your hand.").
 */
export function splitClause(sentence: string): PsctClause {
  const text = sentence.trim();

  const colon = text.indexOf(':');
  const semicolon = text.indexOf(';');

  // PSCT always orders condition before cost. A semicolon appearing before the
  // colon means this is not the standard shape, so don't guess at a trigger.
  const hasTrigger = colon !== -1 && (semicolon === -1 || colon < semicolon);

  const trigger = hasTrigger ? text.slice(0, colon).trim() : undefined;
  const rest = hasTrigger ? text.slice(colon + 1).trim() : text;

  const restSemicolon = rest.indexOf(';');
  const hasCost = restSemicolon !== -1;

  const cost = hasCost ? rest.slice(0, restSemicolon).trim() : undefined;
  const body = hasCost ? rest.slice(restSemicolon + 1).trim() : rest;

  return {
    trigger: trigger || undefined,
    cost: cost || undefined,
    resolutions: splitResolutions(body),
    // "You can" may sit in either the cost ("You can discard 1 other card;
    // add ...") or the resolution ("You can Special Summon ..."), but never in
    // the trigger, which describes something that happens to you.
    optional: OPTIONAL_RE.test(cost ?? '') || OPTIONAL_RE.test(body),
    sourceText: text,
  };
}
