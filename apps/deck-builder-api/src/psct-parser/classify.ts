/**
 * Stage 8 — effect classification.
 *
 * Runs AFTER structural parsing, and takes card metadata as well as text.
 * Classifying on punctuation alone is the single most tempting mistake here,
 * and it is wrong in both directions:
 *
 *  - Terraforming's "Add 1 Field Spell from your Deck to your hand." has no
 *    colon and no semicolon, yet it is an activated effect that starts a Chain,
 *    because every Spell and Trap does when played.
 *  - Botanical Girl's "When this card is sent from the field to the GY, you can
 *    add 1 ..." has no colon either, but it is a genuine trigger effect that
 *    merely predates PSCT.
 *
 * So the colon/semicolon clue is read for MONSTER effects only, and `cardType`
 * is a required part of `ParserContext` for this reason.
 */

import { ConditionKind, EffectKind, TriggerTiming } from './ast';
import type { ConditionNode, ParserContext } from './ast';

/** Spell/Trap subtypes whose card stays on the field after resolving. */
const PERSISTENT_SUBTYPES = new Set(['CONTINUOUS', 'FIELD', 'EQUIP']);

export interface ClassifyInput {
  /**
   * LEADING conditions only — the pipeline filters trailing ones out before
   * calling. A trailing condition gates application rather than activation, so
   * feeding it here would classify "destroy 1 card if you control X" as a
   * trigger effect.
   */
  conditions: ConditionNode[];
  /** True when the sentence carried a colon or a semicolon. */
  hasActivationPunctuation: boolean;
  /** True when the condition was recovered from a comma (pre-PSCT text). */
  legacyCondition: boolean;
  /** True when a Summon condition was found, which is not an effect at all. */
  hasSummonCondition: boolean;
  /** True when the effect states only continuous states and no actions. */
  modifiersOnly: boolean;
  isFlip: boolean;
}

/**
 * Classify one effect.
 *
 * The order of the checks is the classification rule, so it is worth reading as
 * one: a Summon condition is not an effect; a flip effect announces itself; a
 * quick effect announces itself; an event condition makes it a trigger; a
 * window condition makes it an ignition; and only then does the absence of
 * punctuation mean "continuous".
 */
export function classify(input: ClassifyInput, ctx: ParserContext): EffectKind {
  if (input.hasSummonCondition) return EffectKind.SUMMON_CONDITION;
  if (input.isFlip) return EffectKind.FLIP;

  const quickEffect = input.conditions.some((c) => c.quickEffect);
  if (quickEffect) return EffectKind.QUICK;

  const trigger = input.conditions.find(
    (c) => c.kind === ConditionKind.TRIGGER,
  );
  if (trigger) return EffectKind.TRIGGER;

  const window = input.conditions.find((c) => c.kind === ConditionKind.TIMING);

  // A Spell or Trap starts a Chain when activated whatever its punctuation, so
  // the absence of a colon says nothing about it. The only question is whether
  // the card persists on the field and is therefore able to print a continuous
  // effect alongside its activation.
  if (ctx.cardType !== 'MONSTER') {
    const persists = PERSISTENT_SUBTYPES.has(ctx.spellTrapSubType ?? '');
    if (persists && input.modifiersOnly && !input.hasActivationPunctuation) {
      return EffectKind.CONTINUOUS;
    }
    if (window && window.timing === TriggerTiming.WHILE) {
      return EffectKind.CONTINUOUS;
    }
    return EffectKind.ACTIVATED;
  }

  // Monster effects: "While ..." describes a state that holds, not an
  // activation window.
  if (window?.timing === TriggerTiming.WHILE) return EffectKind.CONTINUOUS;
  if (window) return EffectKind.IGNITION;

  // Pre-PSCT text has a condition but no colon. It activates — the condition
  // says so — even though the punctuation clue is absent.
  if (input.legacyCondition) return EffectKind.TRIGGER;

  if (input.hasActivationPunctuation) return EffectKind.ACTIVATED;

  // No trigger, no window, no activation punctuation: a continuous effect, read
  // from the absence exactly as the game defines it. A monster effect like this
  // never activates, so it cannot be chained to or negated by Divine Wrath.
  return input.modifiersOnly ? EffectKind.CONTINUOUS : EffectKind.STATIC;
}

/**
 * Whether the effect starts a Chain.
 *
 * `undefined` rather than `false` for pre-PSCT monster text, because the clue
 * is simply absent there. Reporting `false` for Botanical Girl would be a wrong
 * fact rather than a missing one, and a consumer can tell "unknown" from "no".
 */
export function startsChain(
  input: ClassifyInput,
  ctx: ParserContext,
): boolean | undefined {
  if (input.hasSummonCondition) return false;

  // Spells and Traps always start a Chain when activated.
  if (ctx.cardType !== 'MONSTER') return true;

  if (input.hasActivationPunctuation) return true;

  // A legacy condition means it activates, but the punctuation that would
  // confirm it does not exist on the card.
  if (input.legacyCondition) return undefined;

  // A continuous monster effect genuinely does not start a Chain.
  return input.modifiersOnly ? false : undefined;
}
