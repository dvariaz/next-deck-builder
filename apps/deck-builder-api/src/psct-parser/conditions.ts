/**
 * The condition clause — PSCT's text before the colon.
 *
 * Deliberately NOT run through the grammar. A trigger condition is free-form
 * prose describing an event ("When this card is sent from the field to the GY"),
 * and imposing a grammar on it would invent structure the text does not have.
 * What it IS worth extracting is the handful of properties that change what the
 * card can legally do, and those are readable directly.
 *
 * Crucially, this clause never yields actions. That is the whole point of the
 * structural split: Sangan's condition contains both *sent* and *GY*, and if it
 * reached the action rules it would become a false "send to GY" edge.
 */

import type { IToken } from 'chevrotain';
import { ConditionKind, TriggerTiming } from './ast';
import type {
  ConditionNode,
  ConditionPosition,
  TriggerTiming as TriggerTimingType,
} from './ast';
import { Parenthetical, hintOf, spanOfTokens, tokenFor } from './lexer';
import { TokenKind } from './lexicon';
import { imagesOf } from './structure';
import type { NormalizedText } from './normalize';

const ConditionMarker = tokenFor(TokenKind.CONDITION_MARKER);
const Frequency = tokenFor(TokenKind.FREQUENCY);

/**
 * Activation windows a card is barred from, kept verbatim.
 *
 * The near-universal case is "(except during the Damage Step)". These are not
 * modelled because the set of phrasings is large and the consequence is a
 * timing rule rather than a reachability fact.
 */
const EXCLUSION_RE = /^\(\s*except\b/i;

/** "(Quick Effect)" — Spell Speed 2, usable during the opponent's turn. */
const QUICK_EFFECT_RE = /\(\s*Quick Effect\s*\)/i;

/**
 * Read the condition's timing word.
 *
 * When a condition names BOTH a window and an event — "During either player's
 * turn, when a Spell/Trap Card is activated" — the EVENT governs, because that
 * is what the effect actually triggers off. So a later WHEN/IF beats an earlier
 * DURING/WHILE rather than the first marker simply winning.
 */
export function readTiming(tokens: IToken[]): TriggerTimingType | undefined {
  const markers = tokens
    .filter((t) => t.tokenType === ConditionMarker)
    .map((t) => hintOf(t))
    .filter((h): h is string => Boolean(h));

  if (markers.length === 0) return undefined;

  const event = markers.find(
    (m) => m === 'when' || m === 'if' || m === 'each_time' || m === 'after',
  );
  const hint = event ?? markers[0];

  return Object.values(TriggerTiming).find((t) => t === hint);
}

/**
 * Convert a condition clause into condition nodes.
 *
 * `missesTiming` is left `false` here and corrected by the pipeline once the
 * enclosing effect's `optional` flag is known: a MANDATORY trigger effect never
 * misses its timing regardless of the word, so the word alone cannot decide it.
 */
export function readConditions(
  nt: NormalizedText,
  tokens: IToken[],
  position: ConditionPosition = 'leading',
): ConditionNode[] {
  if (tokens.length === 0) return [];

  const text = imagesOf(tokens);
  const span = spanOfTokens(nt, tokens);
  const parentheticals = tokens
    .filter((t) => t.tokenType === Parenthetical)
    .map((t) => t.image);

  const exclusions = parentheticals.filter((p) => EXCLUSION_RE.test(p));
  const quickEffect = QUICK_EFFECT_RE.test(text);
  const timing = readTiming(tokens);

  const nodes: ConditionNode[] = [];

  // A frequency restriction is its own condition node: "Once per turn:" limits
  // the effect but describes no event, so folding it into a trigger would claim
  // a trigger that is not there.
  const frequencyTokens = tokens.filter((t) => t.tokenType === Frequency);
  for (const frequencyToken of frequencyTokens) {
    nodes.push({
      kind: ConditionKind.FREQUENCY,
      position,
      text: frequencyToken.image,
      missesTiming: false,
      quickEffect: false,
      exclusions: [],
      span: spanOfTokens(nt, [frequencyToken]),
    });
  }

  // Everything that is not purely a frequency statement is the real condition.
  const hasNonFrequency = tokens.some(
    (t) => t.tokenType !== Frequency && t.tokenType !== Parenthetical,
  );

  if (hasNonFrequency || quickEffect) {
    // A TRAILING condition never describes a trigger EVENT, whatever word it
    // opens with: "destroy 1 card if you control a Dragon" has already
    // activated, and the "if" only says whether it does anything. Reporting it
    // as a TRIGGER would make an ignition effect look like a trigger effect.
    // A window ("during your Main Phase") stays a window in either position.
    const isWindow =
      timing === TriggerTiming.WHILE || timing === TriggerTiming.DURING;
    const kind = isWindow
      ? ConditionKind.TIMING
      : timing && position === 'leading'
        ? ConditionKind.TRIGGER
        : ConditionKind.RESTRICTION;

    nodes.push({
      kind,
      position,
      text,
      ...(timing ? { timing } : {}),
      missesTiming: false,
      quickEffect,
      exclusions,
      span,
    });
  }

  return nodes;
}

/**
 * Apply the missing-the-timing rule once optionality is known.
 *
 * An OPTIONAL trigger effect whose condition opens with "When" may only
 * activate if its trigger was the last thing to happen; if anything else
 * resolved after it, the window is gone. "If" carries no such restriction, and
 * a mandatory effect never misses the timing whatever the word.
 *
 * `WHILE` and `DURING` are continuous or ignition windows rather than events,
 * so they are excluded by the `TRIGGER` kind check.
 */
export function applyMissesTiming(
  conditions: ConditionNode[],
  optional: boolean,
): ConditionNode[] {
  return conditions.map((condition) => ({
    ...condition,
    missesTiming:
      optional &&
      condition.position === 'leading' &&
      condition.kind === ConditionKind.TRIGGER &&
      condition.timing === TriggerTiming.WHEN,
  }));
}
