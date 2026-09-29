import { Injectable, NotFoundException } from '@nestjs/common';
import type { AliasHit } from './card-alias.service';
import { CardAliasService } from './card-alias.service';
import { parseCardEffects } from '../card-effect-parser/card-effect-parser';
import {
  PARSER_VERSION,
  type EffectPredicate,
  type EffectTarget,
  type ParsedCardEffects,
} from '../card-effect-parser/card-effect.types';
import { PrismaService } from '../prisma/prisma.service';
import { EffectVocabularyService } from './effect-vocabulary.service';
import {
  excludesExtraDeck,
  projectSearchEffects,
  type SearchEffect,
} from './search-effect';
import {
  criteriaResolveKey,
  NODE_SELECT,
  SearchResolverService,
  type FrontierCard,
  type PredicateRequest,
  type ResolvedCard,
} from './search-resolver.service';
import {
  DEFAULT_OPTIONS,
  type SearchGraph,
  type SearchGraphEdge,
  type SearchGraphNode,
  type SearchGraphOptions,
} from './search-graph.types';

/** An edge discovered during a tier scan, before its target is resolved. */
interface PendingEdge {
  fromId: string;
  fromDepth: number;
  effect: SearchEffect;
  target: EffectTarget;
  /**
   * Cards that answer this target through another name they are treated as,
   * already filtered to the effect's source zones. Resolved per pending edge
   * rather than per tier because the same name searched out of the Deck and
   * out of the GY does not reach the same cards.
   */
  aliasHits: AliasHit[];
}

/** A resolved card plus the alias that found it, if any. */
interface AliasedCard {
  card: ResolvedCard;
  matchedAlias?: string;
}

/** One concrete card an edge points at. */
interface EdgeTarget {
  id: string;
  card?: ResolvedCard;
  /** Set only when the alias is what made this card a match. */
  matchedAlias?: string;
}

const cardNodeId = (id: number) => `card:${id}`;

@Injectable()
export class SearchGraphService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: SearchResolverService,
    private readonly vocabulary: EffectVocabularyService,
    private readonly aliases: CardAliasService,
  ) {}

  /** Build the graph rooted at a card. */
  async buildForCard(
    cardId: number,
    overrides: Partial<SearchGraphOptions> = {},
  ): Promise<SearchGraph> {
    const options = { ...DEFAULT_OPTIONS, ...overrides };

    const root = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: NODE_SELECT,
    });
    if (!root) throw new NotFoundException(`Card ${cardId} not found`);

    return this.expand({
      options,
      seedCards: [root],
      rootId: cardNodeId(root.id),
      rootArchetype: root.archetype,
    });
  }

  /** Expand an existing card node one or more further tiers. */
  async expandCard(
    cardId: number,
    overrides: Partial<SearchGraphOptions> = {},
  ): Promise<SearchGraph> {
    return this.buildForCard(cardId, overrides);
  }

  /**
   * The BFS.
   *
   * One query per tier for the frontier, one for all named targets, one
   * transaction resolving every distinct criteria predicate - never one per
   * effect.
   */
  private async expand(input: {
    options: SearchGraphOptions;
    seedCards: ResolvedCard[];
    rootId: string;
    rootArchetype: string | null | undefined;
  }): Promise<SearchGraph> {
    const { options, seedCards, rootId, rootArchetype } = input;

    const nodes = new Map<string, SearchGraphNode>();
    const edges = new Map<string, SearchGraphEdge>();
    let byDepth = false;

    for (const seed of seedCards) {
      nodes.set(cardNodeId(seed.id), {
        id: cardNodeId(seed.id),
        depth: 0,
        isRoot: cardNodeId(seed.id) === rootId,
        isChainLink: false,
        card: toCardPayload(seed),
      });
    }

    let frontier = seedCards.map((card) => card.id);

    for (let tier = 0; tier < options.depth; tier++) {
      if (!frontier.length) break;

      const frontierCards = await this.resolver.loadFrontier(frontier);
      const pending: PendingEdge[] = [];
      const names = new Set<string>();
      const aliasIds = new Set<number>();
      const predicatesByKey = new Map<string, PredicateRequest>();

      for (const card of frontierCards) {
        const fromId = cardNodeId(card.id);
        const fromDepth = nodes.get(fromId)?.depth ?? tier;

        for (const effect of this.searchEffectsFor(card)) {
          if (
            options.kinds?.length &&
            !effect.kinds.some((kind) => options.kinds!.includes(kind))
          ) {
            continue;
          }

          const { target } = effect;

          if (target.kind === 'self') {
            if (options.includeSelfLoops) {
              pending.push({
                fromId,
                fromDepth,
                effect,
                target,
                aliasHits: [],
              });
            }
            continue;
          }

          // Where the searched card is sitting when it is picked. An alias only
          // counts if it holds in one of those zones.
          const zones = effect.sourceZones.map((zone) => zone.zone);

          if (target.kind === 'named') {
            for (const name of target.names) names.add(name);

            const aliasHits = target.names.flatMap((name) =>
              this.aliases.forName(name, zones),
            );
            for (const hit of aliasHits) aliasIds.add(hit.cardId);

            pending.push({ fromId, fromDepth, effect, target, aliasHits });
            continue;
          }

          if (target.kind === 'criteria') {
            const excludeExtraDeck = excludesExtraDeck(effect.sourceZones);

            // Only the name/archetype half of a predicate can be satisfied by
            // an alias; everything else still has to hold on the card itself.
            const aliasHits = this.aliases.containing(
              target.predicate.archetype ?? target.predicate.nameContains ?? '',
              zones,
            );
            const aliasCardIds = aliasHits.map((hit) => hit.cardId);

            predicatesByKey.set(
              criteriaResolveKey(
                target.predicate,
                excludeExtraDeck,
                aliasCardIds,
              ),
              { predicate: target.predicate, excludeExtraDeck, aliasCardIds },
            );
            pending.push({ fromId, fromDepth, effect, target, aliasHits });
          }
        }
      }

      // --- batch resolution, one round trip each ---------------------------
      // A criteria target ("1 Level 4 or lower Warrior monster") is connected
      // straight to the cards it matches, exactly like a named target — there
      // is no intermediate node describing it.
      const [resolvedCards, aliasCards] = await Promise.all([
        this.resolver.resolveNames([...names]),
        // Criteria aliases come back inside resolvePredicates' own query; only
        // named targets need their alias matches fetched separately.
        this.resolver.resolveIds([...aliasIds]),
      ]);
      const cardsByName = new Map(
        resolvedCards.map((card) => [card.name, card]),
      );
      const cardsById = new Map(aliasCards.map((card) => [card.id, card]));

      const resolvedCriteria = await this.resolver.resolvePredicates([
        ...predicatesByKey.values(),
      ]);

      // --- materialize -----------------------------------------------------
      const nextFrontier: number[] = [];

      for (const item of pending) {
        const targets = this.targetsFor(
          item,
          cardsByName,
          cardsById,
          resolvedCriteria,
        );

        for (const target of targets) {
          const existed = nodes.has(target.id);

          if (!existed) {
            if (
              target.card &&
              options.archetypeOnly &&
              target.card.archetype !== rootArchetype
            ) {
              continue;
            }

            if (!target.card) continue;

            nodes.set(target.id, {
              id: target.id,
              depth: item.fromDepth + 1,
              isRoot: false,
              isChainLink: false,
              card: toCardPayload(target.card),
            });

            nextFrontier.push(target.card.id);
          }

          // The cycle rule: if the node already existed, add the edge and stop.
          // This covers A->B/B->A back-edges (two nodes, two distinct directed
          // edges) and longer cycles identically, with no visited-set special
          // casing.
          const edgeId = `${item.fromId}->${target.id}#${item.effect.id}`;
          if (!edges.has(edgeId)) {
            edges.set(edgeId, {
              id: edgeId,
              from: item.fromId,
              to: target.id,
              verb: item.effect.verb,
              kinds: item.effect.kinds,
              sourceZones: item.effect.sourceZones,
              destination: item.effect.destination,
              optional: item.effect.optional,
              costs: item.effect.costs,
              restrictions: item.effect.restrictions,
              matchedAlias: target.matchedAlias,
              sourceText: item.effect.sourceText,
            });
          }
        }
      }

      if (tier === options.depth - 1 && nextFrontier.length) byDepth = true;
      frontier = nextFrontier;
    }

    markChainLinks(nodes, edges);

    const known = new Set(input.options.known ?? []);
    const visibleNodes = [...nodes.values()].filter(
      (node) => !known.has(node.id),
    );

    return {
      rootId,
      nodes: visibleNodes,
      // Edges to known nodes are always returned, so the client can close
      // cycles back into nodes it already renders.
      edges: [...edges.values()],
      truncated: {
        byDepth,
        depth: options.depth,
      },
      parserVersion: PARSER_VERSION,
    };
  }

  /**
   * Resolve one pending edge to its concrete targets.
   *
   * Sorted by name, so the graph does not flicker between refetches. A
   * criteria target resolves the same way as a named one: straight to every
   * matching card, with no cap on how many.
   */
  private targetsFor(
    item: PendingEdge,
    cardsByName: Map<string, ResolvedCard>,
    cardsById: Map<number, ResolvedCard>,
    resolvedCriteria: Map<string, ResolvedCard[]>,
  ): EdgeTarget[] {
    const { target } = item;

    if (target.kind === 'self') {
      return [{ id: item.fromId }];
    }

    if (target.kind === 'named') {
      const wanted = new Set(target.names);

      const direct: AliasedCard[] = target.names
        .map((name) => cardsByName.get(name))
        .filter((card): card is ResolvedCard => !!card)
        .map((card) => ({ card }));

      // A card whose printed name is already asked for is not "reached by an
      // alias", even if it also happens to carry one.
      const aliased = item.aliasHits
        .map((hit): AliasedCard | undefined => {
          const card = cardsById.get(hit.cardId);
          if (!card || wanted.has(card.name)) return undefined;
          return { card, matchedAlias: hit.aliasName };
        })
        .filter((found): found is AliasedCard => !!found);

      const found = dedupeById([...direct, ...aliased]).sort((a, b) =>
        a.card.name.localeCompare(b.card.name),
      );

      return found.map(({ card, matchedAlias }) => ({
        id: cardNodeId(card.id),
        card,
        matchedAlias,
      }));
    }

    if (target.kind === 'criteria') {
      const key = criteriaResolveKey(
        target.predicate,
        excludesExtraDeck(item.effect.sourceZones),
        item.aliasHits.map((hit) => hit.cardId),
      );
      const cards = resolvedCriteria.get(key);
      if (!cards) return [];

      const aliasNames = new Map(
        item.aliasHits.map((hit) => [hit.cardId, hit.aliasName]),
      );

      return cards.map((card) => ({
        id: cardNodeId(card.id),
        card,
        matchedAlias:
          aliasNames.has(card.id) && !matchesNameTest(card, target.predicate)
            ? aliasNames.get(card.id)
            : undefined,
      }));
    }

    return [];
  }

  /**
   * Effects for a frontier card: the persisted IR when it matches the current
   * parser version, otherwise a live parse. A version bump therefore degrades
   * to slower-but-correct rather than to stale data.
   */
  private searchEffectsFor(card: FrontierCard): SearchEffect[] {
    const persisted = card.cardEffects as unknown as ParsedCardEffects | null;

    const parsed =
      persisted && persisted.version === PARSER_VERSION
        ? persisted
        : parseCardEffects(
            card.description,
            this.vocabulary.contextFor(card.name),
          );

    return projectSearchEffects(parsed);
  }
}

function dedupeById(items: AliasedCard[]): AliasedCard[] {
  const byId = new Map<number, AliasedCard>();
  for (const item of items)
    if (!byId.has(item.card.id)) byId.set(item.card.id, item);
  return [...byId.values()];
}

/**
 * Whether a card satisfies the predicate's name/archetype test on its own.
 *
 * Only used to decide whether the alias is worth SHOWING - a card that matches
 * by name anyway does not need "as \"X\"" on its edge. It never filters
 * results; the query in `predicateToWhere` remains the single source of truth
 * for what matches.
 */
function matchesNameTest(
  card: ResolvedCard,
  predicate: EffectPredicate,
): boolean {
  const name = card.name.toLowerCase();

  if (predicate.archetype) {
    return (
      card.archetype === predicate.archetype ||
      name.includes(predicate.archetype.toLowerCase())
    );
  }
  if (predicate.nameContains) {
    return name.includes(predicate.nameContains.toLowerCase());
  }
  return false;
}

function toCardPayload(card: ResolvedCard) {
  const image = card.cardImages[0];
  return {
    id: card.id,
    ygoId: card.ygoId,
    name: card.name,
    cardType: card.cardType,
    frameType: card.frameType,
    archetype: card.archetype,
    banStatusTcg: card.banStatusTcg,
    banStatusOcg: card.banStatusOcg,
    imageUrl: image?.imageUrl ?? null,
    imageUrlSmall: image?.imageUrlSmall ?? null,
    imageUrlCropped: image?.imageUrlCropped ?? null,
  };
}

/**
 * A node is a chain link when it both receives and gives access — that is the
 * "chained/domino search" category, computed in one pass over the edges.
 */
export function markChainLinks(
  nodes: Map<string, SearchGraphNode>,
  edges: Map<string, SearchGraphEdge>,
) {
  const inbound = new Set<string>();
  const outbound = new Set<string>();

  for (const edge of edges.values()) {
    // A self-loop does not make a node a chain link.
    if (edge.from === edge.to) continue;
    outbound.add(edge.from);
    inbound.add(edge.to);
  }

  for (const node of nodes.values()) {
    node.isChainLink = inbound.has(node.id) && outbound.has(node.id);
  }
}
