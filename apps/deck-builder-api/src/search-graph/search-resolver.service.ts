import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { SummonType } from '../../generated/prisma/enums';
import type { EffectPredicate } from '../card-effect-parser/card-effect.types';
import {
  insensitiveContains,
  levelOrLinkRange,
  numericRange,
} from '../cards/card-where.builder';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Fusion/Synchro/Xyz/Link monsters are mechanically required to start in the
 * Extra Deck - they can never be drawn from the Main Deck, nor held in hand.
 * A search drawing only from zones like those must exclude them; see
 * `excludesExtraDeck` in `search-effect.ts` for which zones qualify.
 */
const EXTRA_DECK_SUMMON_TYPES: SummonType[] = [
  'FUSION',
  'SYNCHRO',
  'XYZ',
  'LINK',
];

/**
 * Turns effect predicates into Prisma queries and resolves them to cards.
 *
 * Everything here filters on structured columns - never on `description` - so
 * the indexes added alongside the cardEffects column carry the whole cost.
 */

/** Exactly the fields a graph node needs to render a card tile. */
export const NODE_SELECT = {
  id: true,
  ygoId: true,
  name: true,
  cardType: true,
  frameType: true,
  archetype: true,
  banStatusTcg: true,
  banStatusOcg: true,
  // Alt-arts give some cards five or more image rows; a node renders one.
  cardImages: {
    take: 1,
    orderBy: { id: 'asc' },
    select: { imageUrl: true, imageUrlSmall: true, imageUrlCropped: true },
  },
} satisfies Prisma.CardSelect;

export type ResolvedCard = Prisma.CardGetPayload<{
  select: typeof NODE_SELECT;
}>;

/** Card fields plus the persisted IR, for expanding a node one more tier. */
export const FRONTIER_SELECT = {
  ...NODE_SELECT,
  description: true,
  cardEffects: true,
} satisfies Prisma.CardSelect;

export type FrontierCard = Prisma.CardGetPayload<{
  select: typeof FRONTIER_SELECT;
}>;

/** One distinct criteria resolve within a tier. */
export interface PredicateRequest {
  predicate: EffectPredicate;
  excludeExtraDeck: boolean;
  /** Cards reaching this predicate through an alias, already zone-filtered. */
  aliasCardIds?: number[];
}

/**
 * Canonicalize a predicate so the same criteria reached from two different
 * cards dedupes to a single resolve query within a tier.
 *
 * Keys and array members are sorted, so key order out of the parser cannot
 * change the result.
 */
export function canonicalizePredicate(predicate: EffectPredicate): string {
  const entries = Object.entries(predicate)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]): [string, unknown] => [
      key,
      Array.isArray(value) ? [...(value as unknown[])].sort() : value,
    ])
    .sort(([a], [b]) => a.localeCompare(b));

  return JSON.stringify(entries);
}

/**
 * Key for a batched criteria resolve. The same predicate reached from two
 * effects with different source zones can resolve to different card sets, so
 * the zone context must be part of the dedup key, not just the predicate.
 *
 * Both extra components derive from those zones: `excludeExtraDeck` (see
 * `predicateToWhere`) and the alias ids, which are selected by the zones the
 * alias holds in. Folding the resolved ids straight into the key keeps the
 * dedup exact without a separate notion of zone identity.
 */
export function criteriaResolveKey(
  predicate: EffectPredicate,
  excludeExtraDeck: boolean,
  aliasCardIds: number[] = [],
): string {
  const aliases = [...aliasCardIds].sort((a, b) => a - b).join(',');
  return `${canonicalizePredicate(predicate)}|${excludeExtraDeck}|${aliases}`;
}

@Injectable()
export class SearchResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build a Prisma `where` from an effect predicate.
   *
   * Note this is NOT `CardsService.buildWhere`: archetype must match exactly
   * here, because the parser already validated it against the DB vocabulary.
   * A `contains` match would pull Destiny/Evil/Masked HERO into a search for
   * "Elemental HERO" cards.
   *
   * `excludeExtraDeck` drops the Extra Deck summon classes - set it when the
   * effect this predicate came from draws only from zones an Extra Deck
   * monster cannot be in (see `excludesExtraDeck` in `search-effect.ts`).
   *
   * `aliasCardIds` are cards that answer to the predicate's name or archetype
   * through an alias ("this card is always treated as ..."), already filtered
   * to the effect's source zones by `CardAliasService`.
   */
  predicateToWhere(
    predicate: EffectPredicate,
    options: { excludeExtraDeck?: boolean; aliasCardIds?: number[] } = {},
  ): Prisma.CardWhereInput {
    const where: Prisma.CardWhereInput = {};
    const and: Prisma.CardWhereInput[] = [];

    if (options.excludeExtraDeck) {
      // `notIn` alone would also exclude every row where summonType is NULL
      // (all Spells/Traps, plus a handful of monsters with no summon class
      // recorded) under SQL's three-valued NULL logic - explicitly keep those.
      and.push({
        OR: [
          { summonType: null },
          { summonType: { notIn: EXTRA_DECK_SUMMON_TYPES } },
        ],
      });
    }

    if (predicate.cardType?.length) where.cardType = { in: predicate.cardType };
    if (predicate.frameType?.length) {
      where.frameType = { in: predicate.frameType };
    }
    if (predicate.summonType?.length) {
      where.summonType = { in: predicate.summonType };
    }
    if (predicate.monsterEffectType?.length) {
      where.monsterEffectType = { in: predicate.monsterEffectType };
    }
    if (predicate.spellTrapSubType?.length) {
      where.spellTrapSubType = { in: predicate.spellTrapSubType };
    }

    // An alias stands in for the NAME test and nothing else: every other
    // field the predicate constrains still has to hold. Toon Summoned Skull
    // is treated as an "Archfiend" card, but it only answers `1 "Archfiend"
    // monster` because it is also a monster.
    const aliasArm: Prisma.CardWhereInput[] = options.aliasCardIds?.length
      ? [{ id: { in: options.aliasCardIds } }]
      : [];

    if (predicate.archetype) {
      // An archetype target matches a card that EITHER carries the archetype
      // OR has the string in its name. Neither test alone is correct:
      //
      //  - Name alone misses 1,807 cards whose archetype is not part of their
      //    name.
      //  - Archetype alone misses nested archetypes, and 50 of them are nested.
      //    "1 \"HERO\" monster" matches 6 cards by archetype but 159 by name,
      //    because Elemental/Destiny/Evil/Masked HERO are their own archetypes.
      //
      // In the game's own terms a quoted target is name-based, with the
      // archetype column filling in the officially-listed exceptions.
      and.push({
        OR: [
          { archetype: predicate.archetype },
          {
            name: {
              contains: predicate.archetype,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          ...aliasArm,
        ],
      });
    }

    const nameContains = insensitiveContains(predicate.nameContains);
    if (nameContains) {
      // With an alias in play this has to move into AND: `where.name` is a
      // single key and cannot express "named that OR aliased to it".
      if (aliasArm.length) {
        and.push({ OR: [{ name: nameContains }, ...aliasArm] });
      } else {
        where.name = nameContains;
      }
    }

    if (predicate.attribute?.length) {
      where.attribute = { in: predicate.attribute };
    }
    if (predicate.race?.length) where.race = { in: predicate.race };

    const atk = numericRange(predicate.atkMin, predicate.atkMax);
    if (atk) where.atk = atk;

    const def = numericRange(predicate.defMin, predicate.defMax);
    if (def) where.def = def;

    const level = levelOrLinkRange(predicate.levelMin, predicate.levelMax);
    if (level) and.push(level);

    const linkVal = numericRange(predicate.linkValMin, predicate.linkValMax);
    if (linkVal) where.linkVal = linkVal;

    if (predicate.isTuner !== undefined) where.isTuner = predicate.isTuner;
    if (predicate.isPendulum !== undefined) {
      where.isPendulum = predicate.isPendulum;
    }
    if (predicate.isEffect !== undefined) where.isEffect = predicate.isEffect;

    // Must go in AND, not `where.NOT`: that key belongs to the strict
    // link-marker complement in the card filters, and a second writer would
    // silently clobber it.
    if (predicate.excludeNames?.length) {
      and.push({ NOT: { name: { in: predicate.excludeNames } } });
    }

    // Tokens are never Main Deck cards, so they are never a search result.
    where.isToken = false;

    if (and.length) where.AND = and;
    return where;
  }

  /** One query for every named target in a tier. */
  async resolveNames(names: string[]): Promise<ResolvedCard[]> {
    if (!names.length) return [];
    return this.prisma.card.findMany({
      where: { name: { in: names }, isToken: false },
      select: NODE_SELECT,
    });
  }

  /**
   * One query for every alias-matched card in a tier.
   *
   * Alias matching happens in memory against `CardAliasService`, so this only
   * has to fetch the rows the graph will render - keeping the tier at a fixed
   * number of round trips.
   */
  async resolveIds(ids: number[]): Promise<ResolvedCard[]> {
    if (!ids.length) return [];
    return this.prisma.card.findMany({
      where: { id: { in: ids }, isToken: false },
      select: NODE_SELECT,
    });
  }

  /** Load frontier cards together with their persisted IR. */
  async loadFrontier(ids: number[]): Promise<FrontierCard[]> {
    if (!ids.length) return [];
    return this.prisma.card.findMany({
      where: { id: { in: ids } },
      select: FRONTIER_SELECT,
    });
  }

  /**
   * Resolve every distinct predicate a tier needs, in a single round trip.
   *
   * A criteria target is connected straight to the cards it matches — there
   * is no intermediate node to expand — so this is on the hot BFS path, not
   * an on-demand extra. Ordered by name so the graph does not flicker
   * between refetches.
   */
  async resolvePredicates(
    requests: PredicateRequest[],
  ): Promise<Map<string, ResolvedCard[]>> {
    if (!requests.length) return new Map();

    const results = await this.prisma.$transaction(
      requests.map(({ predicate, excludeExtraDeck, aliasCardIds }) =>
        this.prisma.card.findMany({
          where: this.predicateToWhere(predicate, {
            excludeExtraDeck,
            aliasCardIds,
          }),
          select: NODE_SELECT,
          orderBy: { name: 'asc' },
        }),
      ),
    );

    const byKey = new Map<string, ResolvedCard[]>();
    requests.forEach(({ predicate, excludeExtraDeck, aliasCardIds }, index) => {
      byKey.set(
        criteriaResolveKey(predicate, excludeExtraDeck, aliasCardIds),
        results[index],
      );
    });
    return byKey;
  }
}
