import { Test } from '@nestjs/testing';
import type { EffectPredicate } from '../card-effect-parser/card-effect.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  SearchResolverService,
  canonicalizePredicate,
  criteriaResolveKey,
} from './search-resolver.service';

const mockFindMany = jest.fn().mockResolvedValue([]);
const mockCount = jest.fn().mockResolvedValue(0);
const mockTransaction = jest.fn().mockResolvedValue([]);

const mockPrisma = {
  card: { findMany: mockFindMany, count: mockCount },
  $transaction: mockTransaction,
};

describe('SearchResolverService', () => {
  let service: SearchResolverService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SearchResolverService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(SearchResolverService);
    jest.clearAllMocks();
  });

  describe('predicateToWhere', () => {
    it('always excludes Tokens', () => {
      expect(service.predicateToWhere({}).isToken).toBe(false);
    });

    it('matches an archetype by column OR by name', () => {
      // Measured on the pool: "HERO" matches 6 cards by archetype column and
      // 159 by name, and 1,807 cards belong to an archetype their name does
      // not contain. Neither test alone is correct.
      expect(service.predicateToWhere({ archetype: 'HERO' }).AND).toEqual([
        {
          OR: [
            { archetype: 'HERO' },
            { name: { contains: 'HERO', mode: 'insensitive' } },
          ],
        },
      ]);
    });

    it('does not put the archetype on the top-level where', () => {
      expect(
        service.predicateToWhere({ archetype: 'HERO' }),
      ).not.toHaveProperty('archetype');
    });

    it('uses contains only for the unknown-archetype fallback', () => {
      expect(
        service.predicateToWhere({ nameContains: 'Ignister' }).name,
      ).toEqual({ contains: 'Ignister', mode: 'insensitive' });
    });

    it('builds in-filters for enum fields', () => {
      const where = service.predicateToWhere({
        cardType: ['MONSTER'],
        summonType: ['FUSION'],
        attribute: ['DARK', 'LIGHT'],
        race: ['Warrior'],
      });
      expect(where.cardType).toEqual({ in: ['MONSTER'] });
      expect(where.summonType).toEqual({ in: ['FUSION'] });
      expect(where.attribute).toEqual({ in: ['DARK', 'LIGHT'] });
      expect(where.race).toEqual({ in: ['Warrior'] });
    });

    it('unifies the level range across level and linkVal', () => {
      expect(service.predicateToWhere({ levelMax: 4 }).AND).toEqual([
        { OR: [{ level: { lte: 4 } }, { linkVal: { lte: 4 } }] },
      ]);
    });

    it('puts excludeNames in AND, never in where.NOT', () => {
      // where.NOT belongs to the strict link-marker complement in the card
      // filters; a second writer there would silently clobber it.
      const where = service.predicateToWhere({
        cardType: ['MONSTER'],
        excludeNames: ['Snake-Eyes Ash'],
      });
      expect(where).not.toHaveProperty('NOT');
      expect(where.AND).toEqual([
        { NOT: { name: { in: ['Snake-Eyes Ash'] } } },
      ]);
    });

    it('keeps a level range, an archetype and an exclusion together', () => {
      const where = service.predicateToWhere({
        archetype: 'HERO',
        levelMax: 4,
        excludeNames: ['X'],
      });
      expect(where.AND).toHaveLength(3);
    });

    it('omits fields that were not constrained', () => {
      const where = service.predicateToWhere({ cardType: ['SPELL'] });
      expect(where).not.toHaveProperty('atk');
      expect(where).not.toHaveProperty('race');
      expect(where).not.toHaveProperty('AND');
    });

    it('ignores empty arrays', () => {
      const where = service.predicateToWhere({ cardType: [], race: [] });
      expect(where).not.toHaveProperty('cardType');
      expect(where).not.toHaveProperty('race');
    });

    it('applies ATK and DEF ranges', () => {
      const where = service.predicateToWhere({ atkMax: 1500, defMin: 2000 });
      expect(where.atk).toEqual({ lte: 1500 });
      expect(where.def).toEqual({ gte: 2000 });
    });

    it('applies boolean flags including false', () => {
      expect(service.predicateToWhere({ isTuner: false }).isTuner).toBe(false);
    });

    describe('excludeExtraDeck', () => {
      it('excludes Extra Deck summon classes but keeps NULL (Spells/Traps, unclassed monsters)', () => {
        const where = service.predicateToWhere(
          { cardType: ['MONSTER'] },
          { excludeExtraDeck: true },
        );
        expect(where.AND).toContainEqual({
          OR: [
            { summonType: null },
            { summonType: { notIn: ['FUSION', 'SYNCHRO', 'XYZ', 'LINK'] } },
          ],
        });
      });

      it('is a no-op when unset', () => {
        const where = service.predicateToWhere({ cardType: ['MONSTER'] });
        expect(where).not.toHaveProperty('AND');
      });
    });
  });

  describe('canonicalizePredicate — dedup key for the batched resolve', () => {
    const a: EffectPredicate = {
      cardType: ['MONSTER'],
      race: ['Warrior'],
      levelMax: 4,
    };

    it('is stable regardless of key order', () => {
      const b: EffectPredicate = {
        levelMax: 4,
        race: ['Warrior'],
        cardType: ['MONSTER'],
      };
      expect(canonicalizePredicate(a)).toBe(canonicalizePredicate(b));
    });

    it('is stable regardless of array order', () => {
      expect(canonicalizePredicate({ attribute: ['DARK', 'LIGHT'] })).toBe(
        canonicalizePredicate({ attribute: ['LIGHT', 'DARK'] }),
      );
    });

    it('ignores undefined fields', () => {
      expect(
        canonicalizePredicate({ cardType: ['MONSTER'], archetype: undefined }),
      ).toBe(canonicalizePredicate({ cardType: ['MONSTER'] }));
    });

    it('differs for different predicates', () => {
      expect(canonicalizePredicate(a)).not.toBe(
        canonicalizePredicate({ cardType: ['SPELL'] }),
      );
    });
  });

  describe('criteriaResolveKey', () => {
    it('differs by excludeExtraDeck for the identical predicate', () => {
      // Two effects can share a predicate but draw from different zones
      // ("1 LIGHT Fiend monster" from the Deck vs from the GY), and those
      // resolve to different card sets.
      const a: EffectPredicate = { cardType: ['MONSTER'] };
      expect(criteriaResolveKey(a, true)).not.toBe(
        criteriaResolveKey(a, false),
      );
    });
  });

  describe('batching', () => {
    it('skips the query entirely for no names', async () => {
      await service.resolveNames([]);
      expect(mockFindMany).not.toHaveBeenCalled();
    });

    it('resolves every name in a tier with ONE query', async () => {
      await service.resolveNames(['A', 'B', 'C']);
      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockFindMany.mock.calls[0][0].where).toEqual({
        name: { in: ['A', 'B', 'C'] },
        isToken: false,
      });
    });

    it('resolves every predicate in ONE round trip', async () => {
      mockTransaction.mockResolvedValueOnce([
        [{ id: 1, name: 'A' }],
        [{ id: 2, name: 'B' }],
      ]);
      const resolved = await service.resolvePredicates([
        { predicate: { cardType: ['MONSTER'] }, excludeExtraDeck: false },
        { predicate: { cardType: ['SPELL'] }, excludeExtraDeck: false },
      ]);
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(
        resolved.get(criteriaResolveKey({ cardType: ['MONSTER'] }, false)),
      ).toEqual([{ id: 1, name: 'A' }]);
      expect(
        resolved.get(criteriaResolveKey({ cardType: ['SPELL'] }, false)),
      ).toEqual([{ id: 2, name: 'B' }]);
    });

    it('orders a criteria resolve by name', async () => {
      mockTransaction.mockResolvedValueOnce([[]]);
      await service.resolvePredicates([
        { predicate: { cardType: ['MONSTER'] }, excludeExtraDeck: false },
      ]);
      expect(mockFindMany.mock.calls[0][0]).toMatchObject({
        orderBy: { name: 'asc' },
      });
      expect(mockFindMany.mock.calls[0][0]).not.toHaveProperty('take');
    });

    it('resolves the same predicate under excludeExtraDeck and not as separate entries', async () => {
      mockTransaction.mockResolvedValueOnce([
        [{ id: 1, name: 'A' }],
        [
          { id: 1, name: 'A' },
          { id: 2, name: 'B (Fusion)' },
        ],
      ]);
      const resolved = await service.resolvePredicates([
        { predicate: { cardType: ['MONSTER'] }, excludeExtraDeck: true },
        { predicate: { cardType: ['MONSTER'] }, excludeExtraDeck: false },
      ]);
      expect(mockFindMany.mock.calls[0][0].where).toMatchObject({
        AND: [
          {
            OR: [
              { summonType: null },
              { summonType: { notIn: ['FUSION', 'SYNCHRO', 'XYZ', 'LINK'] } },
            ],
          },
        ],
      });
      expect(mockFindMany.mock.calls[1][0].where).not.toHaveProperty('AND');
      expect(
        resolved.get(criteriaResolveKey({ cardType: ['MONSTER'] }, true)),
      ).toHaveLength(1);
      expect(
        resolved.get(criteriaResolveKey({ cardType: ['MONSTER'] }, false)),
      ).toHaveLength(2);
    });

    it('requests only one image per card', async () => {
      await service.resolveNames(['A']);
      expect(mockFindMany.mock.calls[0][0].select.cardImages).toMatchObject({
        take: 1,
        orderBy: { id: 'asc' },
      });
    });
  });

  describe('alias arm', () => {
    it('adds aliased ids as a third way to satisfy an archetype', () => {
      const where = service.predicateToWhere(
        { cardType: ['MONSTER'], archetype: 'Blue-Eyes' },
        { aliasCardIds: [7, 9] },
      );

      expect(where.AND).toContainEqual({
        OR: [
          { archetype: 'Blue-Eyes' },
          { name: { contains: 'Blue-Eyes', mode: 'insensitive' } },
          { id: { in: [7, 9] } },
        ],
      });
    });

    it('still applies every other constraint to an aliased card', () => {
      // The alias replaces the NAME test only. Toon Summoned Skull answers
      // `1 "Archfiend" monster` because it is a monster as well as an
      // "Archfiend" card - drop that and the predicate stops meaning anything.
      const where = service.predicateToWhere(
        { cardType: ['MONSTER'], levelMax: 4, archetype: 'Archfiend' },
        { aliasCardIds: [7] },
      );

      expect(where.cardType).toEqual({ in: ['MONSTER'] });
      // levelOrLinkRange unifies Level with Link Rating; see card-where.builder.
      expect(where.AND).toContainEqual({
        OR: [{ level: { lte: 4 } }, { linkVal: { lte: 4 } }],
      });
    });

    it('moves nameContains into AND so the alias can be an alternative', () => {
      // `where.name` is a single key and cannot express "named that OR
      // aliased to it".
      const where = service.predicateToWhere(
        { nameContains: 'Kewl Tune' },
        { aliasCardIds: [7] },
      );

      expect(where.name).toBeUndefined();
      expect(where.AND).toContainEqual({
        OR: [
          { name: { contains: 'Kewl Tune', mode: 'insensitive' } },
          { id: { in: [7] } },
        ],
      });
    });

    it('leaves the query untouched when nothing is aliased', () => {
      expect(
        service.predicateToWhere(
          { nameContains: 'Kewl Tune' },
          { aliasCardIds: [] },
        ),
      ).toEqual(service.predicateToWhere({ nameContains: 'Kewl Tune' }));
    });

    it('keys a resolve by its alias ids, order-independently', () => {
      const predicate: EffectPredicate = { cardType: ['MONSTER'] };

      expect(criteriaResolveKey(predicate, true, [2, 1])).toBe(
        criteriaResolveKey(predicate, true, [1, 2]),
      );
      // Two effects reaching the same predicate from different zones resolve
      // to different alias sets, and must not share a cached result.
      expect(criteriaResolveKey(predicate, true, [1])).not.toBe(
        criteriaResolveKey(predicate, true, []),
      );
    });
  });
});
