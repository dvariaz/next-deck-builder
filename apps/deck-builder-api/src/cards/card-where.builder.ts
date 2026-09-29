import { Prisma } from '../../generated/prisma/client';
import { LINK_MARKERS } from './link-markers.constant';

/**
 * Shared Prisma `where` fragments for the Card model.
 *
 * These encode domain rules that are not obvious from the column names — the
 * Level/Rank/Link unification and the strict link-marker complement in
 * particular — so they live in one place rather than being re-derived by every
 * consumer (`CardsService.buildWhere`, the search-graph resolver, ...).
 *
 * Every helper returns `undefined` when the filter does not apply, so callers
 * can omit the key entirely instead of emitting an empty object.
 */

const insensitive = Prisma.QueryMode.insensitive;

/** Case-insensitive substring match, for free-text fields. */
export function insensitiveContains(
  value?: string,
): Prisma.StringFilter | undefined {
  if (!value) return undefined;
  return { contains: value, mode: insensitive };
}

/**
 * Inclusive numeric range. Omits the bound that was not provided rather than
 * defaulting it, so `{ gte: 2500 }` stays open-ended.
 */
export function numericRange(
  min?: number,
  max?: number,
): Prisma.IntNullableFilter | undefined {
  if (min === undefined && max === undefined) return undefined;
  return {
    ...(min !== undefined && { gte: min }),
    ...(max !== undefined && { lte: max }),
  };
}

/**
 * Unified Level/Rank/Link range.
 *
 * Leveled and Xyz monsters store the value in `level`; Link monsters store
 * their rating in `linkVal`. A single user-facing "Level" range must match
 * either column, so this returns an OR fragment destined for `where.AND`.
 */
export function levelOrLinkRange(
  min?: number,
  max?: number,
): Prisma.CardWhereInput | undefined {
  const range = numericRange(min, max);
  if (!range) return undefined;
  return { OR: [{ level: range }, { linkVal: range }] };
}

/**
 * Link marker filter.
 *
 * Non-strict means "has at least these markers" (`hasEvery`). Strict means
 * "has exactly these and no others", which Postgres array operators cannot
 * express directly — it is built as `hasEvery(selected) AND NOT hasSome(complement)`.
 */
export function linkMarkerFilter(
  markers?: string[],
  strict?: boolean,
): Pick<Prisma.CardWhereInput, 'linkMarkers' | 'NOT'> | undefined {
  if (!markers?.length) return undefined;

  const filter: Pick<Prisma.CardWhereInput, 'linkMarkers' | 'NOT'> = {
    linkMarkers: { hasEvery: markers },
  };

  if (strict) {
    const complement = LINK_MARKERS.filter((m) => !markers.includes(m));
    filter.NOT = { linkMarkers: { hasSome: complement } };
  }

  return filter;
}
