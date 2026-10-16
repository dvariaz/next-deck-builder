/**
 * `CardFilter` -> Prisma `where`.
 *
 * This is the translation the whole parser was built to enable. `CardFilter`
 * is expressed in queryable Card columns precisely so that "what can fetch a
 * Level 4 DARK Warrior" becomes a database question rather than a string match,
 * and this file is where that cashes out.
 *
 * It lives in the CONSUMER, not in `psct-parser/`, on purpose: the parser
 * package is framework-free and holds no Prisma dependency, not even a type
 * import. Keeping the translation here preserves that, and means a second
 * consumer could map the same IR onto a different store.
 *
 * Correctness rule throughout: an ABSENT field means "not constrained", never
 * "zero". Emitting a clause for a field the card text never mentioned would
 * silently narrow the result set and turn a missing fact into a wrong one.
 */

import type { Prisma } from '../../generated/prisma/client';
import type { CardFilter } from '../psct-parser/ast';

/** Prisma enum column names, which must be cast from the IR's plain strings. */
type CardWhere = Prisma.CardWhereInput;

/**
 * Build a numeric range clause, or undefined when neither bound is set.
 *
 * `0` is a legitimate bound — a monster can have 0 ATK, and "0 or less ATK" is
 * real text — so this tests for `undefined` rather than falsiness.
 */
function range(
  min: number | undefined,
  max: number | undefined,
): { gte?: number; lte?: number } | undefined {
  if (min === undefined && max === undefined) return undefined;
  return {
    ...(min !== undefined ? { gte: min } : {}),
    ...(max !== undefined ? { lte: max } : {}),
  };
}

/**
 * Translate one parsed filter into a Prisma `where`.
 *
 * Returns `null` when the filter constrains nothing. That is deliberately not
 * an empty `{}`: an empty where matches every card in the game, so handing one
 * to a caller asking "what can this card fetch" would claim the card fetches
 * anything. A null forces the caller to decide, and `CardEffectsService`
 * declines to answer rather than returning 14,000 rows.
 */
export function filterToWhere(filter: CardFilter): CardWhere | null {
  const where: CardWhere = {};

  // Enum columns. The IR stores plain strings (it must not import Prisma), so
  // these are cast at the boundary — this file is that boundary.
  if (filter.cardType?.length) {
    where.cardType = { in: filter.cardType as never[] };
  }
  if (filter.summonType?.length) {
    where.summonType = { in: filter.summonType as never[] };
  }
  if (filter.spellTrapSubType?.length) {
    where.spellTrapSubType = { in: filter.spellTrapSubType as never[] };
  }

  // Plain string columns.
  if (filter.attribute?.length) {
    where.attribute = { in: filter.attribute };
  }
  if (filter.race?.length) {
    where.race = { in: filter.race };
  }

  /**
   * `archetype` is an EXACT match; the parser already validated the quoted
   * token against the pool's own archetype vocabulary before setting it.
   * `nameContains` is the degraded fallback for a quoted token that is NOT a
   * known archetype, and is a substring match by nature.
   */
  if (filter.archetype) {
    where.archetype = filter.archetype;
  }
  if (filter.nameContains) {
    where.name = { contains: filter.nameContains, mode: 'insensitive' };
  }

  const level = range(filter.levelMin, filter.levelMax);
  if (level) where.level = level;

  const linkVal = range(filter.linkValMin, filter.linkValMax);
  if (linkVal) where.linkVal = linkVal;

  const atk = range(filter.atkMin, filter.atkMax);
  if (atk) where.atk = atk;

  const def = range(filter.defMin, filter.defMax);
  if (def) where.def = def;

  if (filter.isTuner !== undefined) where.isTuner = filter.isTuner;
  if (filter.isPendulum !== undefined) where.isPendulum = filter.isPendulum;

  /**
   * `excludeNames` comes from `except "X"` and is scoped to THIS filter, as a
   * NOT on the same clause. It is never applied as a top-level `where.NOT`,
   * which would exclude those cards from an entire query rather than from the
   * one family the text carved them out of.
   */
  if (filter.excludeNames?.length) {
    where.NOT = filter.excludeNames.map((name) => ({ name }));
  }

  // `position` (face-up / face-down) and `isEffect` describe board state and a
  // frame distinction the schema does not carry as columns, so they are
  // deliberately not translated. Dropping them widens the result set, which is
  // the safe direction: a caller sees extra candidates rather than being told
  // a real one does not exist.

  const constrained = Object.keys(where).filter((k) => k !== 'NOT');
  return constrained.length > 0 ? where : null;
}
