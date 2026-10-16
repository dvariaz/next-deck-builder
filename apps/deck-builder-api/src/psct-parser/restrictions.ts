/**
 * Restrictions, Summon conditions, and the sentences that are not effects.
 *
 * These are read from the sentence as a whole rather than from a clause part,
 * because they are statements ABOUT an effect rather than parts of one: a
 * once-per-turn line governs the effects around it, and a Summon condition
 * describes the card's own arrival on the field.
 *
 * Getting Summon conditions classified rather than parsed is the load-bearing
 * part. A Nomi monster's "Must be Special Summoned by banishing 3 monsters from
 * your GY" is full of Summon and banish verbs but describes no searchable
 * action, so without classification it would both pollute the review queue and
 * produce false edges.
 */

import { SummonConditionKind } from './ast';
import type { Restrictions, Span, SummonConditionNode } from './ast';

/**
 * Hard once-per-turn: limits the whole PLAY by name, not this copy.
 *
 * The distinction from a soft once-per-turn matters for deck building: a soft
 * limit is per copy, so running three copies gives three uses, while a hard
 * limit gives one regardless.
 */
const HARD_OPT_PATTERNS: {
  re: RegExp;
  scope: 'effect' | 'activation' | 'summon';
}[] = [
  {
    re: /You can only use (?:this|each) effect of\s+"([^"]+)"\s+once per turn/i,
    scope: 'effect',
  },
  {
    re: /You can only use this effect of\s+"([^"]+)"\s+once per Duel/i,
    scope: 'effect',
  },
  {
    re: /You can only activate\s+\d*\s*"([^"]+)"\s+(?:once )?per turn/i,
    scope: 'activation',
  },
  {
    re: /You can only (?:Special )?Summon\s+"([^"]+)"\(?s?\)?\s+once per turn/i,
    scope: 'summon',
  },
  // The name-free hard forms: still name-locked in effect, since they govern
  // the card's effect rather than the copy.
  {
    re: /You can only use (?:this|each) effect of this card once per turn/i,
    scope: 'effect',
  },
];

/** Bare "Once per turn" with no name — limited per copy. */
const SOFT_OPT_RE = /\bOnce per turn\b/i;

/**
 * Summon-condition shapes.
 *
 * `SEMI_NOMI` must be tested before `NOMI`: the only difference is the word
 * "first", and collapsing the two would wrongly exclude every semi-Nomi monster
 * from generic revival. Once a semi-Nomi monster has been Summoned properly,
 * other effects MAY bring it back, so it IS a legal object for "Special Summon
 * 1 monster from your GY".
 */
const SUMMON_CONDITION_PATTERNS: {
  re: RegExp;
  kind: SummonConditionKind;
}[] = [
  {
    re: /\bMust first be (?:Special Summoned|Summoned)\b[^.]*/i,
    kind: SummonConditionKind.SEMI_NOMI,
  },
  {
    re: /\bCannot be Special Summoned\b[^.]*/i,
    kind: SummonConditionKind.NOMI,
  },
  {
    re: /\bMust be (?:Special Summoned|Summoned)\b[^.]*/i,
    kind: SummonConditionKind.NOMI,
  },
  {
    re: /\bYou can Normal Summon this card without Tributing\b[^.]*/i,
    kind: SummonConditionKind.NO_TRIBUTE,
  },
  {
    re: /\b(?:Requires|You can Ritual Summon this card with)\b[^.]*/i,
    kind: SummonConditionKind.RITUAL,
  },
];

/**
 * Display-only clauses: locks that constrain the player but name no action.
 *
 * Kept verbatim because the useful fact is "this card locks you into Fiends
 * this turn", and modelling the lock's scope precisely would be a rules engine.
 */
const LABEL_PATTERNS: RegExp[] = [
  /You can only control \d+\s*"[^"]+"/i,
  /You cannot (?:Special Summon|Normal Summon|Summon)[^.;]*/i,
  /You cannot activate (?:cards|card effects|monster effects)[^.;]*/i,
  /For the rest of this turn[^.;]*/i,
  /You can only (?:Special Summon|Summon) "[^"]+"\(?s?\)?[^.;]*/i,
];

/** Names carved out by `except "X"` / `other than "X"`. */
const EXCEPT_RE = /\b(?:except|other than)\b([^.;]*)/gi;
const QUOTED_RE = /"([^"]+)"/g;

export function extractExceptNames(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(EXCEPT_RE)) {
    const tail = match[1] ?? '';
    for (const quoted of tail.matchAll(QUOTED_RE)) {
      names.push(quoted[1]);
    }
  }
  return [...new Set(names)];
}

export function parseSummonConditions(
  text: string,
  span: Span,
): SummonConditionNode[] {
  const found: SummonConditionNode[] = [];

  for (const { re, kind } of SUMMON_CONDITION_PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    found.push({ kind, text: match[0].trim(), span });
    // One classification per sentence: the patterns overlap by design (every
    // semi-Nomi line also matches the Nomi shape), and the first match is the
    // most specific one.
    break;
  }

  return found;
}

/**
 * Read every restriction a sentence states.
 *
 * `cardName` is needed because a hard once-per-turn is name-locked, and the
 * name in the text is frequently the card's own.
 */
export function readRestrictions(
  text: string,
  span: Span,
  cardName: string,
): Restrictions {
  const restrictions: Restrictions = {
    exceptNames: extractExceptNames(text),
    labels: [],
    summonConditions: parseSummonConditions(text, span),
  };

  for (const { re, scope } of HARD_OPT_PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    restrictions.hardOncePerTurn = {
      scope,
      name: match[1] ?? cardName,
    };
    break;
  }

  // A soft once-per-turn only counts when there is no hard one: "You can only
  // use this effect of "X" once per turn" contains the words "once per turn"
  // but is the hard form, and recording both would double-count the limit.
  if (!restrictions.hardOncePerTurn && SOFT_OPT_RE.test(text)) {
    restrictions.softOncePerTurn = true;
  }

  for (const re of LABEL_PATTERNS) {
    const match = re.exec(text);
    if (match) restrictions.labels.push(match[0].trim());
  }

  return restrictions;
}

/**
 * Sentences that are not effects at all.
 *
 * These make up thousands of sentences across the pool, and recording them as
 * effects — or queueing them for review — would bury the real ones:
 *
 *  - a bare once-per-turn or "you can only control" statement, already captured
 *    as a restriction on the effects it governs;
 *  - an Extra Deck materials line ("2 Level 4 monsters", '"Gladiator Beast
 *    Laquari" + 2 "Gladiator Beast" monsters'), which is a Summon requirement
 *    printed above the effect text;
 *  - a lone parenthetical aside, which describes identity rather than behaviour.
 */
const NOT_AN_EFFECT_PATTERNS: RegExp[] = [
  // The trailing "this way" / "while ... is face-up" tails are common: the
  // sentence is still a pure restriction, so the pattern must not anchor
  // immediately after "per turn".
  // `[^;:]*` rather than `[^.]*`: a quoted card name can contain periods
  // ("You can only activate 1 \"A.I. Connect\" per turn."), so a
  // period-excluding span cannot reach the "per turn" that follows it.
  /^\s*You can only (?:use|activate|Special Summon|Summon)\b[^;:]*per (?:turn|Duel)\b[^;:]*\.?\s*$/i,
  /^\s*You can only control\b[^;:]*\.?\s*$/i,
  // A materials line: descriptors joined by "+", with no verb and no clause
  // punctuation.
  /^\s*\d+\+?\s[^.;:]*\s\+\s[^.;:]*\.?\s*$/,
  /^\s*"[^"]+"\s*\+\s[^.;:]*\.?\s*$/,
  /^\s*\d+\+?\s(?:or more\s)?[^.;:]{0,60}monsters?\.?\s*$/i,
  // A single parenthesised group and nothing else. `[^)]` rather than `.` is
  // load-bearing: a greedy version also matches any sentence that merely STARTS
  // with "(" and ends with ")", which would swallow a real effect printed
  // between two asides.
  /^\s*\([^)]*\)\.?\s*$/,
];

export function isNotAnEffect(sentence: string): boolean {
  return NOT_AN_EFFECT_PATTERNS.some((re) => re.test(sentence));
}

/**
 * Fold a governing restriction sentence into an effect's own restrictions.
 *
 * A bare "You can only use this effect of "X" once per turn." is not an effect
 * — it states no condition and performs no action — but it does limit the
 * effects printed around it. Skipping the sentence outright (which is right,
 * since it would otherwise become an empty effect) would therefore silently
 * lose a real and deck-relevant limit.
 *
 * The effect's own restrictions win: a sentence that states its own limit is
 * more specific than a card-level line.
 */
export function mergeRestrictions(
  own: Restrictions,
  governing: Restrictions,
): Restrictions {
  return {
    hardOncePerTurn: own.hardOncePerTurn ?? governing.hardOncePerTurn,
    softOncePerTurn: own.softOncePerTurn ?? governing.softOncePerTurn,
    exceptNames: [...new Set([...own.exceptNames, ...governing.exceptNames])],
    labels: [...new Set([...own.labels, ...governing.labels])],
    // Summon conditions are never governing: they describe the card's own
    // arrival, so they belong only to the sentence that printed them.
    summonConditions: own.summonConditions,
  };
}
