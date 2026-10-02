import { TriggerTiming } from './card-effect.types';

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
 * PSCT was introduced in 2011. 3,803 of the 14,353 cards in the pool predate
 * it and carry no colon or semicolon at all, stating the condition as a
 * comma-delimited lead instead; `splitLegacyClause` handles that shape, and
 * without it every one of those cards' effects is lost to the passive-voice
 * guard in stage 6.
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

/** Spell Speed 2 — activatable during the opponent's turn. */
const QUICK_EFFECT_RE = /\(Quick Effect\)/i;

/**
 * Parenthesised activation windows the effect is barred from. The pool's
 * dominant form by far is "(except during the Damage Step)", on 635 cards.
 */
const EXCLUSION_RE = /\((?:except|but not)\s+[^)]{0,100}\)/gi;

/**
 * Every verb that can open a resolution. Shared by the legacy trigger and
 * legacy cost splitters, which both need to know "a clause starts here".
 *
 * Wider than stage 6's verb table on purpose: this list only has to recognise
 * a clause boundary, so including verbs the IR does not model ("Inflict",
 * "Gain") costs nothing and keeps the boundary in the right place.
 */
const ACTION_VERB =
  '(?:Add|Special Summon|Normal Summon|Flip Summon|Pendulum Summon|Ritual Summon|Set|Send|Banish|Draw|Excavate|Reveal|Return|Shuffle|Destroy|Negate|Equip|Attach|Place|Tribute|Discard|Detach|Select|Target|Choose|Inflict|Gain|Pay|Increase|Decrease|Change|Take|Halve|Double|Apply|Declare|Roll|Toss|Look|Show|Pick up)';

/**
 * A legacy sentence opens with its condition. The optional "Once per turn,"
 * and "Once," prefixes are extremely common and must not block the match.
 */
const LEGACY_OPENER_RE =
  /^\s*(?:Once per turn,\s*|Once,\s*|Once per turn\s+)?(?:When|If|While|During|Each time|After)\b/i;

/**
 * The comma that ends a legacy condition: the one followed by either the
 * subject of a resolution ("you can") or a bare imperative verb.
 *
 * The FIRST such comma wins, because the condition always precedes the
 * resolution. Anchoring on what FOLLOWS the comma rather than on the comma
 * itself is what keeps this off the many commas inside a condition
 * ("During the End Phase of the turn that a B.E.S. monster, or a Big Core, is
 * destroyed and sent to the GY, you can ...").
 */
const LEGACY_SPLIT_RE = new RegExp(
  `,\\s*(?=(?:you can|you may|you must)\\b|${ACTION_VERB}\\b)`,
  'i',
);

/**
 * A legacy cost: "pay 800 Life Points to Special Summon ...". PSCT would print
 * this as "pay 800 LP; Special Summon ...", so lifting it here gives legacy
 * cards the same cost/resolution split modern ones get from the semicolon.
 *
 * The `to` must be followed by a verb, which is what distinguishes a cost from
 * a destination ("add 1 card ... to your hand").
 */
const LEGACY_COST_RE = new RegExp(
  `^(?:you can\\s+|you may\\s+|you must\\s+)?((?:pay|Tribute|discard|banish|remove|detach|send)\\b[^,;]{0,80}?)\\s+to\\s+(?=${ACTION_VERB}\\b)`,
  'i',
);

/**
 * Trigger timing words, with the regex that finds each one as a clause opener.
 *
 * Order is not priority — position in the text is (see `parseTiming`).
 */
const TIMING_PATTERNS: { timing: TriggerTiming; re: RegExp }[] = [
  { timing: TriggerTiming.EACH_TIME, re: /\bEach time\b/i },
  { timing: TriggerTiming.WHEN, re: /\bWhen\b/i },
  { timing: TriggerTiming.IF, re: /\bIf\b/i },
  { timing: TriggerTiming.WHILE, re: /\bWhile\b/i },
  { timing: TriggerTiming.DURING, re: /\bDuring\b/i },
  { timing: TriggerTiming.AFTER, re: /\bAfter\b/i },
];

export interface PsctClause {
  /** Text before the colon. Never yields actions. */
  trigger?: string;
  /** Text between the colon and the semicolon — paid, not performed. */
  cost?: string;
  /** Text after the semicolon, split into chained segments. */
  resolutions: string[];
  optional: boolean;
  /** The trigger's opening word, when there is a trigger. */
  timing?: TriggerTiming;
  quickEffect: boolean;
  /** Verbatim "(except during the Damage Step)"-style windows. */
  exclusions: string[];
  /** True when the trigger came from a legacy comma split, not a colon. */
  legacy: boolean;
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
 * The timing word a condition opens with.
 *
 * Earliest position wins, with one exception: "When" outranks "While"/"During"
 * whenever both appear, because "When" names the EVENT and the event is what
 * decides whether the effect can miss the timing. "Once per turn, when this
 * card is targeted for an attack" is a WHEN trigger that happens to mention a
 * window; "During the End Phase of the turn that a monster was destroyed" is a
 * DURING window that happens to describe an event.
 */
export function parseTiming(trigger: string): TriggerTiming | undefined {
  const hits = TIMING_PATTERNS.map(({ timing, re }) => {
    const match = re.exec(trigger);
    return match ? { timing, at: match.index } : undefined;
  }).filter((h): h is { timing: TriggerTiming; at: number } => !!h);

  if (!hits.length) return undefined;

  const when = hits.find((h) => h.timing === TriggerTiming.WHEN);
  const earliest = hits.reduce((a, b) => (b.at < a.at ? b : a));

  if (
    when &&
    (earliest.timing === TriggerTiming.WHILE ||
      earliest.timing === TriggerTiming.DURING)
  ) {
    return TriggerTiming.WHEN;
  }

  return earliest.timing;
}

/** Verbatim parenthesised activation-window exclusions. */
function parseExclusions(sentence: string): string[] {
  return [...sentence.matchAll(EXCLUSION_RE)].map((m) => m[0]);
}

/**
 * Split a legacy (pre-PSCT) sentence into condition, cost and resolution.
 *
 * Returns undefined when the sentence is not that shape, so the caller can
 * fall through to treating it as a bare resolution.
 */
function splitLegacyClause(
  text: string,
): { trigger: string; cost?: string; body: string } | undefined {
  if (!LEGACY_OPENER_RE.test(text)) return undefined;

  const split = LEGACY_SPLIT_RE.exec(text);
  if (!split) return undefined;

  const trigger = text.slice(0, split.index).trim();
  let body = text.slice(split.index + split[0].length).trim();
  if (!trigger || !body) return undefined;

  let cost: string | undefined;
  const costMatch = LEGACY_COST_RE.exec(body);
  if (costMatch) {
    cost = costMatch[1].trim();
    body = body.slice(costMatch[0].length).trim();
  }

  return { trigger, cost, body };
}

/**
 * Split one sentence into its PSCT parts.
 *
 * A sentence with neither colon nor semicolon is either legacy text with a
 * comma-delimited condition, or all resolution — most vanilla Spells read that
 * way ("Add 1 Level 4 or lower Warrior monster from your Deck to your hand.").
 */
export function splitClause(sentence: string): PsctClause {
  const text = sentence.trim();
  const quickEffect = QUICK_EFFECT_RE.test(text);
  const exclusions = parseExclusions(text);

  const colon = text.indexOf(':');
  const semicolon = text.indexOf(';');

  // PSCT always orders condition before cost. A semicolon appearing before the
  // colon means this is not the standard shape, so don't guess at a trigger.
  const hasTrigger = colon !== -1 && (semicolon === -1 || colon < semicolon);

  // Legacy text has no PSCT punctuation at all: the condition is marked by a
  // comma. Only attempt it when neither delimiter is present, so a modern
  // card's commas can never be mistaken for a clause boundary.
  if (!hasTrigger && semicolon === -1 && colon === -1) {
    const legacy = splitLegacyClause(text);
    if (legacy) {
      return {
        trigger: legacy.trigger,
        cost: legacy.cost,
        resolutions: splitResolutions(legacy.body),
        optional:
          OPTIONAL_RE.test(legacy.cost ?? '') || OPTIONAL_RE.test(legacy.body),
        timing: parseTiming(legacy.trigger),
        quickEffect,
        exclusions,
        legacy: true,
        sourceText: text,
      };
    }
  }

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
    timing: trigger ? parseTiming(trigger) : undefined,
    quickEffect,
    exclusions,
    legacy: false,
    sourceText: text,
  };
}
