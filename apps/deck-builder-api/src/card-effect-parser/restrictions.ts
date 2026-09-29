import type { EffectRestrictions } from './card-effect.types';
import { unmaskBare } from './normalize';

/**
 * Stage 7 — once-per-turn limits and display-only restriction labels.
 *
 * Scope matters and is easy to get wrong:
 *
 *  - HARD once-per-turn is CARD-scoped. "You can only use each effect of "X"
 *    once per turn" limits the whole play by card name, across every copy, so
 *    it applies to every effect on the card.
 *
 *  - SOFT once-per-turn is SENTENCE-scoped. Trickstar Light Stage's bare
 *    "Once per turn:" governs only its second effect; blanket-applying it
 *    would wrongly restrict the search in its first sentence.
 */

/** A masked card-name token. */
const NAME = '\\u0001Q(\\d+)\\u0001';

/**
 * Tolerant by design. The pool contains at least a dozen phrasings -
 * "this effect of", "each effect of", "each of the following effects of",
 * "1 of these effects of", "the previous effect of" - covering 4,100+ cards
 * between them. Matching the shape rather than enumerating variants means a
 * new printing does not silently lose its limit.
 */
const HARD_OPT_EFFECT_RE = new RegExp(
  `You can only use\\b[^.]{0,60}?\\beffects?\\s+of\\s+${NAME}[^.]{0,40}?once per turn`,
  'i',
);

const HARD_OPT_ACTIVATE_RE = new RegExp(
  `You can only activate\\s+\\d*\\s*${NAME}[^.]{0,40}?per turn`,
  'i',
);

const HARD_OPT_SUMMON_RE = new RegExp(
  `You can only Special Summon\\b[^.]{0,40}?${NAME}[^.]{0,40}?per turn`,
  'i',
);

/** Bare "Once per turn" — a per-copy limit, not a per-name one. */
const SOFT_OPT_RE = /\bOnce per turn\b/i;
const ONLY_CLAUSE_RE = /\bYou can only\b/i;

/**
 * Display-only clauses. Kept verbatim rather than modelled: the UI needs to
 * warn "this line locks you into FIRE monsters", it does not need a machine
 * model of summon locks, and building one is a rabbit hole with no payoff for
 * a graph view.
 */
const LABEL_PATTERNS: { kind: string; re: RegExp }[] = [
  {
    kind: 'Summon lock',
    re: /you cannot Special Summon[^.;]*?(?:except|other than)[^.;]*/i,
  },
  {
    kind: 'Summon lock',
    re: /you cannot Special Summon monsters?(?:\s+for the rest of this turn)?/i,
  },
  {
    kind: 'Activation lock',
    re: /you cannot activate cards?,? or the effects of cards?,?[^.;]*/i,
  },
  { kind: 'Turn lock', re: /for the rest of this turn/i },
  {
    kind: 'Phase lock',
    re: /during (?:your |the )?(?:Main Phase\s*\d?|Battle Phase|End Phase|Standby Phase|Damage Step)/i,
  },
];

/**
 * Card-scoped hard once-per-turn, read from the whole card text.
 *
 * Returns the card name the limit is keyed to, which is what makes it "hard" —
 * it caps the play regardless of how many copies you draw.
 */
export function parseHardOncePerTurn(
  maskedText: string,
  names: string[],
): EffectRestrictions['hardOncePerTurn'] {
  const effect = HARD_OPT_EFFECT_RE.exec(maskedText);
  if (effect) {
    return { scope: 'EFFECT', name: names[Number(effect[1])] };
  }

  const activation = HARD_OPT_ACTIVATE_RE.exec(maskedText);
  if (activation) {
    return { scope: 'ACTIVATION', name: names[Number(activation[1])] };
  }

  // Excluded: "you can only Special Summon "X" monsters for the rest of this
  // turn" is an archetype lock, not a once-per-turn limit.
  const summon = HARD_OPT_SUMMON_RE.exec(maskedText);
  if (summon && !/for the rest of this turn/i.test(summon[0])) {
    return { scope: 'SUMMON', name: names[Number(summon[1])] };
  }

  return undefined;
}

/**
 * Sentence-scoped soft once-per-turn.
 *
 * "Once per turn" counts as soft only when it is not part of a "You can only
 * ... once per turn" sentence, which is the hard form.
 */
export function parseSoftOncePerTurn(sentence: string): boolean {
  if (ONLY_CLAUSE_RE.test(sentence)) return false;
  return SOFT_OPT_RE.test(sentence);
}

/** Verbatim restriction labels found across a set of text fragments. */
export function extractLabels(
  fragments: (string | undefined)[],
  names: string[],
): string[] {
  const labels = new Set<string>();

  for (const fragment of fragments) {
    if (!fragment) continue;
    for (const { kind, re } of LABEL_PATTERNS) {
      const match = re.exec(fragment);
      if (!match) continue;
      labels.add(`${kind}: ${unmaskBare(match[0], names).trim()}`);
      break; // one label per fragment
    }
  }

  return [...labels];
}
