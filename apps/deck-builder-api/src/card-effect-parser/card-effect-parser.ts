import { parseActions } from './actions';
import {
  EffectVerb,
  PARSER_VERSION,
  type CardEffect,
  type EffectAction,
  type ParsedCardEffects,
  type ParserContext,
} from './card-effect.types';
import { splitClause } from './clauses';
import { parseCost } from './cost';
import { preprocess, unmaskBare } from './normalize';
import {
  extractLabels,
  parseHardOncePerTurn,
  parseSoftOncePerTurn,
} from './restrictions';
import { splitBlocks, splitSentences } from './segment';
import { extractExceptNames } from './target';

/**
 * The card effect parser entry point.
 *
 * Pipeline: preprocess -> blocks -> sentences -> PSCT clauses -> actions,
 * with restrictions layered on at the scope each one actually belongs to.
 *
 * Pure and framework-free, so both the Nest service and the `tsx` batch script
 * can call it.
 */

/**
 * Does this text look like it should have produced an effect? Deliberately
 * loose - it only drives the review queue, and over-queueing costs nothing.
 */
const LOOKS_LIKE_EFFECT_RE =
  /\b(?:Add|Special Summon|Normal Summon|Set|Send|Banish|Excavate|Draw|Destroy|Negate)\b/i;

/** Verbs whose presence in an unparsed sentence is worth flagging. */
const SEARCH_VERB_RE = /\b(?:Add|Special Summon|Normal Summon|Set)\b/i;

export function parseCardEffects(
  description: string,
  ctx: ParserContext,
  parsedAt: string = new Date().toISOString(),
): ParsedCardEffects {
  const { masked, names } = preprocess(description ?? '');

  // Hard once-per-turn is a property of the CARD, not of any one sentence:
  // "You can only use each effect of "X" once per turn" caps the whole play.
  const hardOncePerTurn = parseHardOncePerTurn(masked, names);

  const effects: CardEffect[] = [];
  const unparsed: string[] = [];

  for (const block of splitBlocks(masked)) {
    // A bullet inherits the trigger and cost stated once before the list.
    const leadIn = block.leadIn ? splitClause(block.leadIn) : undefined;

    splitSentences(block.text).forEach((sentence, sentenceIndex) => {
      const clause = splitClause(sentence);

      const actions: EffectAction[] = [];

      // Bullets under "...includes any of these effects" QUOTE effects the
      // card negates. They are not instructions, so they yield no actions.
      if (!block.quotedEffects) {
        const inheritedExcept = extractExceptNames(sentence, names);
        for (const segment of clause.resolutions) {
          actions.push(
            ...parseActions(segment, names, ctx, { inheritedExcept }),
          );
        }
      }

      if (!actions.length) {
        if (!block.quotedEffects && SEARCH_VERB_RE.test(sentence)) {
          unparsed.push(unmaskBare(sentence, names));
        }
        return;
      }

      const costText = [leadIn?.cost, clause.cost].filter(Boolean).join('; ');

      effects.push({
        id: `${block.index}.${sentenceIndex}`,
        blockKind: block.kind,
        trigger: clause.trigger
          ? { text: unmaskBare(clause.trigger, names) }
          : leadIn?.trigger
            ? { text: unmaskBare(leadIn.trigger, names) }
            : undefined,
        cost: parseCost(costText, names),
        actions,
        restrictions: {
          ...(hardOncePerTurn ? { hardOncePerTurn } : {}),
          // Soft OPT is scoped to the sentence it appears in - Trickstar Light
          // Stage's "Once per turn:" governs only its second effect.
          ...(parseSoftOncePerTurn(sentence) ? { softOncePerTurn: true } : {}),
          exceptNames: extractExceptNames(sentence, names),
          labels: extractLabels(
            [...clause.resolutions, clause.trigger, block.leadIn],
            names,
          ),
        },
        optional: clause.optional || leadIn?.optional || false,
        sourceText: unmaskBare(sentence, names),
      });
    });
  }

  const needsReview =
    unparsed.length > 0 ||
    (effects.length === 0 && LOOKS_LIKE_EFFECT_RE.test(description ?? ''));

  return {
    version: PARSER_VERSION,
    parsedAt,
    origin: 'RULES',
    effects,
    unparsed,
    needsReview,
  };
}

/** Every action across every effect, flattened. */
export function allActions(parsed: ParsedCardEffects): EffectAction[] {
  return parsed.effects.flatMap((effect) => effect.actions);
}

/** Resolved actions whose verb can put a card somewhere you can use it. */
export function resolvedSearchActions(
  parsed: ParsedCardEffects,
): { effect: CardEffect; action: EffectAction }[] {
  const searchVerbs: EffectVerb[] = [
    EffectVerb.ADD,
    EffectVerb.SPECIAL_SUMMON,
    EffectVerb.NORMAL_SUMMON,
    EffectVerb.SET,
  ];

  return parsed.effects.flatMap((effect) =>
    effect.actions
      .filter((action) => action.resolved && searchVerbs.includes(action.verb))
      .map((action) => ({ effect, action })),
  );
}
