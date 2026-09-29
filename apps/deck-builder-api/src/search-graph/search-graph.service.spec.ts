import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { aliasAppliesInZones } from '../card-effect-parser/alias';
import { PARSER_VERSION } from '../card-effect-parser/card-effect.types';
import type {
  EffectPredicate,
  EffectZone,
} from '../card-effect-parser/card-effect.types';
import { CardAliasService } from './card-alias.service';
import { PrismaService } from '../prisma/prisma.service';
import { EffectVocabularyService } from './effect-vocabulary.service';
import {
  SearchResolverService,
  criteriaResolveKey,
} from './search-resolver.service';
import { SearchGraphService } from './search-graph.service';

/**
 * These specs test GRAPH MECHANICS, not parsing. The resolver is mocked
 * entirely and effects are hand-built, so a parser change cannot make a
 * cycle-handling regression look green.
 */

interface FakeCard {
  id: number;
  name: string;
  archetype?: string | null;
  /** Names this card searches. */
  searches?: string[];
  /** A described target this card searches. */
  criteria?: Record<string, unknown>;
  /** Searches itself. */
  self?: boolean;
  /** Where this card's searches draw from. Defaults to the Deck. */
  zone?: EffectZone;
}

/** An alias granted to a card, as CardAliasService would report it. */
interface FakeAlias {
  cardId: number;
  /** The other name that card answers to. */
  name: string;
  /** Zones the alias holds in; `null` for "always". */
  zones: EffectZone[] | null;
}

const makeEffect = (
  target: unknown,
  id = '0.0.0',
  zone: EffectZone = 'DECK',
) => ({
  id,
  verb: 'ADD',
  sourceZones: [{ zone, owner: 'SELF' }],
  destination: 'HAND',
  target,
  kinds: ['DECK_SEARCH'],
  costs: [],
  restrictions: [],
  optional: false,
  sourceText: 'Add 1 card from your Deck to your hand.',
});

/** A criteria predicate resolves to these named cards, capped by the caller. */
interface CriteriaResolution {
  predicate: EffectPredicate;
  matches: string[];
  /** Defaults to true: this file's fixtures search the Deck unless told not to. */
  excludeExtraDeck?: boolean;
  /** Cards the alias index contributes to this predicate. */
  aliasCardIds?: number[];
}

function buildWorld(
  cards: FakeCard[],
  criteriaResolutions: CriteriaResolution[] = [],
  aliases: FakeAlias[] = [],
) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const byName = new Map(cards.map((c) => [c.name, c]));
  // This file's fixtures source from the Deck only (see makeEffect) unless a
  // case says otherwise, so excludeExtraDeck defaults to true here.
  const matchesByKey = new Map(
    criteriaResolutions.map((r) => [
      criteriaResolveKey(
        r.predicate,
        r.excludeExtraDeck ?? true,
        r.aliasCardIds,
      ),
      r.matches,
    ]),
  );

  const toRow = (c: FakeCard) => ({
    id: c.id,
    ygoId: 1000 + c.id,
    name: c.name,
    cardType: 'MONSTER',
    frameType: 'EFFECT',
    archetype: c.archetype ?? null,
    banStatusTcg: null,
    banStatusOcg: null,
    cardImages: [
      { imageUrl: `img-${c.id}`, imageUrlSmall: null, imageUrlCropped: null },
    ],
  });

  const effectsFor = (c: FakeCard) => {
    const zone = c.zone ?? 'DECK';
    const effects: unknown[] = [];
    if (c.self) effects.push(makeEffect({ kind: 'self' }, '0.0.self', zone));
    (c.searches ?? []).forEach((name, i) =>
      effects.push(
        makeEffect({ kind: 'named', names: [name] }, `0.0.${i}`, zone),
      ),
    );
    if (c.criteria) {
      effects.push(
        makeEffect(
          {
            kind: 'criteria',
            predicate: c.criteria,
            label: 'described target',
          },
          '0.0.c',
          zone,
        ),
      );
    }
    return effects;
  };

  const prisma = {
    card: {
      findUnique: jest.fn(({ where }: { where: { id: number } }) => {
        const card = byId.get(where.id);
        return Promise.resolve(card ? toRow(card) : null);
      }),
    },
  };

  const resolver = {
    loadFrontier: jest.fn((ids: number[]) =>
      Promise.resolve(
        ids
          .map((id) => byId.get(id))
          .filter((c): c is FakeCard => !!c)
          .map((c) => ({
            ...toRow(c),
            description: '',
            // Persisted IR at the current version, so no live parse happens.
            cardEffects: {
              version: PARSER_VERSION,
              parsedAt: '',
              origin: 'RULES',
              unparsed: [],
              needsReview: false,
              effects: [
                {
                  id: '0.0',
                  blockKind: 'MAIN',
                  cost: {},
                  optional: false,
                  sourceText: '',
                  restrictions: { exceptNames: [], labels: [] },
                  actions: effectsFor(c).map((e) => ({
                    verb: 'ADD',
                    sourceZones: [{ zone: c.zone ?? 'DECK', owner: 'SELF' }],
                    destination: 'HAND',
                    target: (e as { target: unknown }).target,
                    quantity: { min: 1, max: 1 },
                    resolved: true,
                    sourceText: 'Add 1 card from your Deck to your hand.',
                  })),
                },
              ],
            },
          })),
      ),
    ),
    resolveNames: jest.fn((names: string[]) =>
      Promise.resolve(
        names
          .map((n) => byName.get(n))
          .filter((c): c is FakeCard => !!c)
          .map(toRow),
      ),
    ),
    resolveIds: jest.fn((ids: number[]) =>
      Promise.resolve(
        ids
          .map((id) => byId.get(id))
          .filter((c): c is FakeCard => !!c)
          .map(toRow),
      ),
    ),
    resolvePredicates: jest.fn(
      (
        requests: {
          predicate: EffectPredicate;
          excludeExtraDeck: boolean;
          aliasCardIds?: number[];
        }[],
      ) => {
        const byKey = new Map<string, unknown[]>();
        for (const { predicate, excludeExtraDeck, aliasCardIds } of requests) {
          const key = criteriaResolveKey(
            predicate,
            excludeExtraDeck,
            aliasCardIds,
          );
          const matches = (matchesByKey.get(key) ?? [])
            .map((name) => byName.get(name))
            .filter((c): c is FakeCard => !!c)
            .map(toRow);
          byKey.set(key, matches);
        }
        return Promise.resolve(byKey);
      },
    ),
  };

  // Uses the REAL zone rule, so the BFS specs exercise conditional aliases
  // end to end rather than trusting a hand-written stub.
  const hits = (matching: FakeAlias[], zones: EffectZone[]) =>
    matching
      .filter((alias) => aliasAppliesInZones(alias.zones, zones))
      .map((alias) => ({ cardId: alias.cardId, aliasName: alias.name }));

  const aliasIndex = {
    forName: jest.fn((name: string, zones: EffectZone[]) =>
      hits(
        aliases.filter((a) => a.name.toLowerCase() === name.toLowerCase()),
        zones,
      ),
    ),
    containing: jest.fn((fragment: string, zones: EffectZone[]) =>
      fragment
        ? hits(
            aliases.filter((a) =>
              a.name.toLowerCase().includes(fragment.toLowerCase()),
            ),
            zones,
          )
        : [],
    ),
  };

  return { prisma, resolver, aliasIndex };
}

async function serviceFor(
  cards: FakeCard[],
  criteriaResolutions: CriteriaResolution[] = [],
  aliases: FakeAlias[] = [],
) {
  const { prisma, resolver, aliasIndex } = buildWorld(
    cards,
    criteriaResolutions,
    aliases,
  );
  const module = await Test.createTestingModule({
    providers: [
      SearchGraphService,
      { provide: PrismaService, useValue: prisma },
      { provide: SearchResolverService, useValue: resolver },
      { provide: CardAliasService, useValue: aliasIndex },
      {
        provide: EffectVocabularyService,
        useValue: {
          contextFor: () => ({
            archetypes: new Set(),
            races: new Set(),
            cardName: '',
          }),
        },
      },
    ],
  }).compile();
  return { service: module.get(SearchGraphService), resolver };
}

describe('SearchGraphService', () => {
  describe('basic shape', () => {
    it('returns just the root when nothing is searched', async () => {
      const { service } = await serviceFor([{ id: 1, name: 'A' }]);
      const graph = await service.buildForCard(1);
      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0]).toMatchObject({
        id: 'card:1',
        isRoot: true,
        depth: 0,
      });
      expect(graph.edges).toEqual([]);
    });

    it('throws for a missing card', async () => {
      const { service } = await serviceFor([]);
      await expect(service.buildForCard(99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('builds a linear chain and stamps depth', async () => {
      const { service } = await serviceFor([
        { id: 1, name: 'A', searches: ['B'] },
        { id: 2, name: 'B', searches: ['C'] },
        { id: 3, name: 'C' },
      ]);
      const graph = await service.buildForCard(1, { depth: 2 });
      expect(graph.nodes.map((n) => n.id).sort()).toEqual([
        'card:1',
        'card:2',
        'card:3',
      ]);
      expect(graph.nodes.find((n) => n.id === 'card:3')?.depth).toBe(2);
      expect(graph.edges).toHaveLength(2);
    });

    it('carries enough card data to render a tile', async () => {
      const { service } = await serviceFor([{ id: 1, name: 'A' }]);
      const graph = await service.buildForCard(1);
      expect(graph.nodes[0].card).toMatchObject({
        id: 1,
        name: 'A',
        cardType: 'MONSTER',
        imageUrl: 'img-1',
      });
    });
  });

  describe('cycles — the rule that makes loops safe', () => {
    it('A→B→A yields 2 nodes and 2 distinct directed edges', async () => {
      const { service } = await serviceFor([
        { id: 1, name: 'A', searches: ['B'] },
        { id: 2, name: 'B', searches: ['A'] },
      ]);
      const graph = await service.buildForCard(1, { depth: 3 });
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(2);
      expect(graph.edges.map((e) => `${e.from}->${e.to}`).sort()).toEqual([
        'card:1->card:2',
        'card:2->card:1',
      ]);
    });

    it('never duplicates a node already in the graph', async () => {
      // Diamond: A→B, A→C, B→D, C→D. D must appear once.
      const { service } = await serviceFor([
        { id: 1, name: 'A', searches: ['B', 'C'] },
        { id: 2, name: 'B', searches: ['D'] },
        { id: 3, name: 'C', searches: ['D'] },
        { id: 4, name: 'D' },
      ]);
      const graph = await service.buildForCard(1, { depth: 3 });
      expect(graph.nodes).toHaveLength(4);
      expect(graph.edges).toHaveLength(4);
      expect(graph.nodes.filter((n) => n.id === 'card:4')).toHaveLength(1);
    });

    it('terminates on a 3-cycle instead of looping forever', async () => {
      const { service } = await serviceFor([
        { id: 1, name: 'A', searches: ['B'] },
        { id: 2, name: 'B', searches: ['C'] },
        { id: 3, name: 'C', searches: ['A'] },
      ]);
      const graph = await service.buildForCard(1, { depth: 3 });
      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges).toHaveLength(3);
    });

    it('suppresses self-loops by default', async () => {
      const { service } = await serviceFor([{ id: 1, name: 'A', self: true }]);
      const graph = await service.buildForCard(1);
      expect(graph.edges).toEqual([]);
    });

    it('includes self-loops when asked', async () => {
      const { service } = await serviceFor([{ id: 1, name: 'A', self: true }]);
      const graph = await service.buildForCard(1, { includeSelfLoops: true });
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0]).toMatchObject({ from: 'card:1', to: 'card:1' });
    });
  });

  describe('isChainLink — the chained/domino category', () => {
    it('marks a node with both inbound and outbound edges', async () => {
      const { service } = await serviceFor([
        { id: 1, name: 'A', searches: ['B'] },
        { id: 2, name: 'B', searches: ['C'] },
        { id: 3, name: 'C' },
      ]);
      const graph = await service.buildForCard(1, { depth: 2 });
      const byId = new Map(graph.nodes.map((n) => [n.id, n]));
      expect(byId.get('card:2')?.isChainLink).toBe(true);
      expect(byId.get('card:1')?.isChainLink).toBe(false);
      expect(byId.get('card:3')?.isChainLink).toBe(false);
    });

    it('does not let a self-loop alone make a node a chain link', async () => {
      const { service } = await serviceFor([{ id: 1, name: 'A', self: true }]);
      const graph = await service.buildForCard(1, { includeSelfLoops: true });
      expect(graph.nodes[0].isChainLink).toBe(false);
    });
  });

  describe('budgets', () => {
    it('stops at the requested depth', async () => {
      const { service } = await serviceFor([
        { id: 1, name: 'A', searches: ['B'] },
        { id: 2, name: 'B', searches: ['C'] },
        { id: 3, name: 'C' },
      ]);
      const graph = await service.buildForCard(1, { depth: 1 });
      expect(graph.nodes.map((n) => n.id).sort()).toEqual(['card:1', 'card:2']);
      expect(graph.truncated.byDepth).toBe(true);
    });

    it('does not report depth truncation when the graph is exhausted', async () => {
      const { service } = await serviceFor([
        { id: 1, name: 'A', searches: ['B'] },
        { id: 2, name: 'B' },
      ]);
      const graph = await service.buildForCard(1, { depth: 3 });
      expect(graph.truncated.byDepth).toBe(false);
    });

    it('resolves deterministically, so the graph does not flicker on refetch', async () => {
      const world: FakeCard[] = [
        { id: 1, name: 'A', searches: ['Zeta', 'Alpha', 'Mu'] },
        { id: 2, name: 'Zeta' },
        { id: 3, name: 'Alpha' },
        { id: 4, name: 'Mu' },
      ];
      const first = await serviceFor(world);
      const second = await serviceFor(world);
      const a = await first.service.buildForCard(1);
      const b = await second.service.buildForCard(1);
      expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id));
    });
  });

  describe('query batching — no N+1', () => {
    it('issues one frontier load and one name resolution per tier', async () => {
      const { service, resolver } = await serviceFor([
        { id: 1, name: 'A', searches: ['B', 'C'] },
        { id: 2, name: 'B', searches: ['D'] },
        { id: 3, name: 'C', searches: ['D'] },
        { id: 4, name: 'D' },
      ]);
      await service.buildForCard(1, { depth: 2 });
      // 2 tiers, not 2 + one per effect.
      expect(resolver.loadFrontier).toHaveBeenCalledTimes(2);
      expect(resolver.resolveNames).toHaveBeenCalledTimes(2);
    });

    it('resolves both of a tier’s names in a single call', async () => {
      const { service, resolver } = await serviceFor([
        { id: 1, name: 'A', searches: ['B', 'C'] },
        { id: 2, name: 'B' },
        { id: 3, name: 'C' },
      ]);
      await service.buildForCard(1, { depth: 1 });
      expect(resolver.resolveNames.mock.calls[0][0].sort()).toEqual(['B', 'C']);
    });
  });

  describe('criteria targets — resolved straight to cards, no intermediate node', () => {
    it('connects a criteria effect directly to the matching cards', async () => {
      const { service } = await serviceFor(
        [
          { id: 1, name: 'A', criteria: { cardType: ['MONSTER'] } },
          { id: 2, name: 'B' },
        ],
        [{ predicate: { cardType: ['MONSTER'] }, matches: ['B'] }],
      );
      const graph = await service.buildForCard(1);
      expect(graph.nodes.map((n) => n.id).sort()).toEqual(['card:1', 'card:2']);
      expect(graph.nodes.every((n) => !!n.card)).toBe(true);
      expect(graph.edges).toEqual([
        expect.objectContaining({ from: 'card:1', to: 'card:2' }),
      ]);
    });

    it('dedupes the same predicate reached from two cards into one resolve call', async () => {
      const { service, resolver } = await serviceFor(
        [
          { id: 1, name: 'A', searches: ['B'] },
          { id: 2, name: 'B', criteria: { cardType: ['MONSTER'] } },
          { id: 3, name: 'C', criteria: { cardType: ['MONSTER'] } },
        ],
        [{ predicate: { cardType: ['MONSTER'] }, matches: [] }],
      );
      // A -> B in tier 0; B and C's own criteria effects resolve in tier 1 -
      // C is never reached, but B is, and its criteria predicate is the same
      // one this test wires up.
      await service.buildForCard(1, { depth: 2 });
      const secondTierCall = resolver.resolvePredicates.mock.calls[1][0];
      expect(secondTierCall).toHaveLength(1);
    });

    it('connects a criteria effect to every matching card, with no cap', async () => {
      const { service } = await serviceFor(
        [
          { id: 1, name: 'A', criteria: { cardType: ['MONSTER'] } },
          { id: 2, name: 'B' },
          { id: 3, name: 'C' },
        ],
        [{ predicate: { cardType: ['MONSTER'] }, matches: ['B', 'C'] }],
      );
      const graph = await service.buildForCard(1);
      expect(graph.nodes).toHaveLength(3); // root + both matches
    });
  });

  describe('archetypeOnly', () => {
    it('drops off-archetype targets', async () => {
      const { service } = await serviceFor([
        { id: 1, name: 'A', archetype: 'Trickstar', searches: ['B', 'C'] },
        { id: 2, name: 'B', archetype: 'Trickstar' },
        { id: 3, name: 'C', archetype: 'Sky Striker Ace' },
      ]);
      const graph = await service.buildForCard(1, { archetypeOnly: true });
      expect(graph.nodes.map((n) => n.id).sort()).toEqual(['card:1', 'card:2']);
    });

    it('keeps everything when off', async () => {
      const { service } = await serviceFor([
        { id: 1, name: 'A', archetype: 'Trickstar', searches: ['C'] },
        { id: 3, name: 'C', archetype: 'Sky Striker Ace' },
      ]);
      const graph = await service.buildForCard(1, { archetypeOnly: false });
      expect(graph.nodes).toHaveLength(2);
    });
  });

  describe('kind filtering', () => {
    it('keeps edges whose kinds overlap the filter', async () => {
      const { service } = await serviceFor([
        { id: 1, name: 'A', searches: ['B'] },
        { id: 2, name: 'B' },
      ]);
      const graph = await service.buildForCard(1, { kinds: ['DECK_SEARCH'] });
      expect(graph.edges).toHaveLength(1);
    });

    it('drops edges with no overlap', async () => {
      const { service } = await serviceFor([
        { id: 1, name: 'A', searches: ['B'] },
        { id: 2, name: 'B' },
      ]);
      const graph = await service.buildForCard(1, { kinds: ['REVIVAL'] });
      expect(graph.edges).toEqual([]);
      expect(graph.nodes).toHaveLength(1);
    });
  });

  describe('incremental expansion', () => {
    it('omits known nodes but still returns edges into them', async () => {
      // This is what lets the client grow the graph without refetching, and
      // still close cycles back into nodes it already renders.
      const { service } = await serviceFor([
        { id: 1, name: 'A', searches: ['B'] },
        { id: 2, name: 'B' },
      ]);
      const graph = await service.buildForCard(1, { known: ['card:2'] });
      expect(graph.nodes.map((n) => n.id)).toEqual(['card:1']);
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].to).toBe('card:2');
    });
  });

  describe('edges', () => {
    it('carries the verbatim clause and classification for the label', async () => {
      const { service } = await serviceFor([
        { id: 1, name: 'A', searches: ['B'] },
        { id: 2, name: 'B' },
      ]);
      const graph = await service.buildForCard(1);
      expect(graph.edges[0]).toMatchObject({
        verb: 'ADD',
        kinds: ['DECK_SEARCH'],
        sourceText: 'Add 1 card from your Deck to your hand.',
      });
    });

    it('gives every edge a stable unique id', async () => {
      const { service } = await serviceFor([
        { id: 1, name: 'A', searches: ['B', 'C'] },
        { id: 2, name: 'B' },
        { id: 3, name: 'C' },
      ]);
      const graph = await service.buildForCard(1);
      const ids = graph.edges.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('stamps the parser version so the client can detect stale data', async () => {
      const { service } = await serviceFor([{ id: 1, name: 'A' }]);
      expect((await service.buildForCard(1)).parserVersion).toBe(
        PARSER_VERSION,
      );
    });
  });

  // The two manual-testing findings this feature exists for. What matters is
  // not that an alias is matched, but that a CONDITIONAL one is matched only
  // where it holds - an unconditional match everywhere would be a wrong edge.
  describe('aliases', () => {
    const tract = { id: 1, name: 'Searcher', searches: ['Fallen of Albaz'] };
    const whiteDragon = { id: 2, name: 'Fallen of the White Dragon' };

    const always = [
      { cardId: 2, name: 'Fallen of Albaz', zones: null },
    ] satisfies FakeAlias[];
    const fieldOrGy = [
      { cardId: 2, name: 'Fallen of Albaz', zones: ['FIELD', 'GY'] },
    ] satisfies FakeAlias[];

    it('reaches a card through an unconditional alias', async () => {
      const { service } = await serviceFor([tract, whiteDragon], [], always);
      const graph = await service.buildForCard(1, { depth: 1 });

      expect(graph.nodes.map((n) => n.id).sort()).toEqual(['card:1', 'card:2']);
    });

    it('labels that edge with the name that matched', async () => {
      const { service } = await serviceFor([tract, whiteDragon], [], always);
      const graph = await service.buildForCard(1, { depth: 1 });

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].matchedAlias).toBe('Fallen of Albaz');
    });

    it('does NOT reach a field/GY alias from a Deck search', async () => {
      // In the Deck the card is still only itself, so this edge would be wrong.
      const { service } = await serviceFor([tract, whiteDragon], [], fieldOrGy);
      const graph = await service.buildForCard(1, { depth: 1 });

      expect(graph.nodes.map((n) => n.id)).toEqual(['card:1']);
      expect(graph.edges).toEqual([]);
    });

    it('DOES reach the same alias from a GY search', async () => {
      const { service } = await serviceFor(
        [{ ...tract, zone: 'GY' as const }, whiteDragon],
        [],
        fieldOrGy,
      );
      const graph = await service.buildForCard(1, { depth: 1 });

      expect(graph.nodes.map((n) => n.id).sort()).toEqual(['card:1', 'card:2']);
      expect(graph.edges[0].matchedAlias).toBe('Fallen of Albaz');
    });

    it('leaves matchedAlias unset when the printed name already matched', async () => {
      // A chip reading `as "X"` on a card literally called "X" is noise.
      const { service } = await serviceFor(
        [tract, { id: 2, name: 'Fallen of Albaz' }],
        [],
        [{ cardId: 2, name: 'Fallen of Albaz', zones: null }],
      );
      const graph = await service.buildForCard(1, { depth: 1 });

      expect(graph.edges[0].matchedAlias).toBeUndefined();
    });

    it('adds an aliased card to a criteria result', async () => {
      const predicate = { archetype: 'Blue-Eyes' };
      const { service } = await serviceFor(
        [
          { id: 1, name: 'Searcher', criteria: predicate },
          { id: 2, name: 'Dragon Spirit of White' },
        ],
        [
          {
            predicate,
            matches: ['Dragon Spirit of White'],
            aliasCardIds: [2],
          },
        ],
        [{ cardId: 2, name: 'Blue-Eyes', zones: null }],
      );
      const graph = await service.buildForCard(1, { depth: 1 });

      expect(graph.nodes.map((n) => n.id).sort()).toEqual(['card:1', 'card:2']);
      expect(graph.edges[0].matchedAlias).toBe('Blue-Eyes');
    });
  });
});
