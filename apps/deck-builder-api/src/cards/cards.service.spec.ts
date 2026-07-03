import { Test, TestingModule } from '@nestjs/testing';
import { CardsService } from './cards.service';
import { PrismaService } from '../prisma/prisma.service';
import { FindCardsDto } from './dto/find-cards.dto';

const mockFindMany = jest.fn().mockResolvedValue([]);
const mockCount = jest.fn().mockResolvedValue(0);

const mockPrismaService = {
  card: {
    findMany: mockFindMany,
    count: mockCount,
  },
};

describe('CardsService', () => {
  let service: CardsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CardsService>(CardsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('always includes cardImages, orderBy name, and pagination', () => {
      const dto: FindCardsDto = { skip: 0, take: 20 };
      service.findAll(dto);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { cardImages: true },
          orderBy: { name: 'asc' },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('passes custom pagination to findMany', () => {
      service.findAll({ skip: 60, take: 10 });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 60, take: 10 }),
      );
    });

    describe('buildWhere — text filters', () => {
      it('omits where.name when name is not provided', () => {
        service.findAll({ skip: 0, take: 20 });

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where).not.toHaveProperty('name');
      });

      it('builds case-insensitive contains filter for name', () => {
        service.findAll({ name: 'dragon', skip: 0, take: 20 });

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.name).toEqual({ contains: 'dragon', mode: 'insensitive' });
      });

      it('builds case-insensitive contains filter for archetype', () => {
        service.findAll({ archetype: 'Blue-Eyes', skip: 0, take: 20 });

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.archetype).toEqual({ contains: 'Blue-Eyes', mode: 'insensitive' });
      });

      it('omits the q filter when q is not provided', () => {
        service.findAll({ skip: 0, take: 20 });

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where).not.toHaveProperty('OR');
      });

      it('searches name and description for the q query string', () => {
        service.findAll({ q: 'destroy', skip: 0, take: 20 });

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.OR).toEqual([
          { name: { contains: 'destroy', mode: 'insensitive' } },
          { description: { contains: 'destroy', mode: 'insensitive' } },
        ]);
      });

      it('builds an `in` filter for a single attribute value', () => {
        service.findAll({ attribute: ['DARK'], skip: 0, take: 20 });

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.attribute).toEqual({ in: ['DARK'] });
      });

      it('builds an `in` filter for multiple attribute values', () => {
        service.findAll({ attribute: ['DARK', 'LIGHT'], skip: 0, take: 20 });

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.attribute).toEqual({ in: ['DARK', 'LIGHT'] });
      });

      it('omits the attribute filter when an empty array is provided', () => {
        service.findAll({ attribute: [], skip: 0, take: 20 });

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where).not.toHaveProperty('attribute');
      });

      it('builds an `in` filter for race', () => {
        service.findAll({ race: ['Dragon', 'Spellcaster'], skip: 0, take: 20 });

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.race).toEqual({ in: ['Dragon', 'Spellcaster'] });
      });
    });

    describe('buildWhere — link markers', () => {
      it('builds a `hasEvery` filter for link markers (non-strict)', () => {
        service.findAll({ linkMarker: ['top', 'bottom'], skip: 0, take: 20 });

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.linkMarkers).toEqual({ hasEvery: ['top', 'bottom'] });
        expect(where).not.toHaveProperty('NOT');
      });

      it('adds a complement `NOT hasSome` filter when strict', () => {
        service.findAll({
          linkMarker: ['top', 'bottom'],
          linkMarkerStrict: true,
          skip: 0,
          take: 20,
        });

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.linkMarkers).toEqual({ hasEvery: ['top', 'bottom'] });
        expect(where.NOT).toEqual({
          linkMarkers: {
            hasSome: ['right', 'left', 'top-left', 'top-right', 'bottom-right', 'bottom-left'],
          },
        });
      });

      it('omits the link marker filter when an empty array is provided', () => {
        service.findAll({ linkMarker: [], linkMarkerStrict: true, skip: 0, take: 20 });

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where).not.toHaveProperty('linkMarkers');
        expect(where).not.toHaveProperty('NOT');
      });
    });

    describe('buildWhere — enum filters', () => {
      it('filters by cardType', () => {
        service.findAll({ cardType: ['MONSTER'], skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.cardType).toEqual({ in: ['MONSTER'] });
      });

      it('filters by multiple frameTypes', () => {
        service.findAll({ frameType: ['FUSION', 'SYNCHRO'], skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.frameType).toEqual({ in: ['FUSION', 'SYNCHRO'] });
      });

      it('filters by summonType', () => {
        service.findAll({ summonType: ['SYNCHRO'], skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.summonType).toEqual({ in: ['SYNCHRO'] });
      });

      it('filters by monsterEffectType', () => {
        service.findAll({ monsterEffectType: ['EFFECT'], skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.monsterEffectType).toEqual({ in: ['EFFECT'] });
      });

      it('filters by spellTrapSubType', () => {
        service.findAll({ spellTrapSubType: ['QUICK_PLAY'], skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.spellTrapSubType).toEqual({ in: ['QUICK_PLAY'] });
      });

      it('filters by banStatusTcg', () => {
        service.findAll({ banStatusTcg: ['FORBIDDEN'], skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.banStatusTcg).toEqual({ in: ['FORBIDDEN'] });
      });

      it('filters by banStatusOcg', () => {
        service.findAll({ banStatusOcg: ['LIMITED'], skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.banStatusOcg).toEqual({ in: ['LIMITED'] });
      });
    });

    describe('buildWhere — range filters', () => {
      it('omits atk filter when neither bound is provided', () => {
        service.findAll({ skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where).not.toHaveProperty('atk');
      });

      it('builds atk filter with both bounds', () => {
        service.findAll({ atkMin: 1000, atkMax: 3000, skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.atk).toEqual({ gte: 1000, lte: 3000 });
      });

      it('builds atk filter with only min bound (no lte key)', () => {
        service.findAll({ atkMin: 2500, skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.atk).toEqual({ gte: 2500 });
        expect(where.atk).not.toHaveProperty('lte');
      });

      it('builds atk filter with only max bound (no gte key)', () => {
        service.findAll({ atkMax: 1500, skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.atk).toEqual({ lte: 1500 });
        expect(where.atk).not.toHaveProperty('gte');
      });

      it('builds def range filter', () => {
        service.findAll({ defMin: 0, defMax: 2000, skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.def).toEqual({ gte: 0, lte: 2000 });
      });

      it('builds a level/link range filter matching either level or linkVal', () => {
        service.findAll({ levelMin: 4, levelMax: 8, skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.AND).toEqual([
          { OR: [{ level: { gte: 4, lte: 8 } }, { linkVal: { gte: 4, lte: 8 } }] },
        ]);
        expect(where.level).toBeUndefined();
      });

      it('applies an open-ended level/link range (min only) to both columns', () => {
        service.findAll({ levelMin: 3, skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.AND).toEqual([
          { OR: [{ level: { gte: 3 } }, { linkVal: { gte: 3 } }] },
        ]);
      });
    });

    describe('buildWhere — boolean flags', () => {
      it('omits boolean flags when not provided', () => {
        service.findAll({ skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where).not.toHaveProperty('isEffect');
        expect(where).not.toHaveProperty('isTuner');
      });

      it('includes isTuner: true when explicitly set', () => {
        service.findAll({ isTuner: true, skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.isTuner).toBe(true);
      });

      it('includes isTuner: false when explicitly set to false', () => {
        service.findAll({ isTuner: false, skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.isTuner).toBe(false);
      });

      it('filters all boolean flags independently', () => {
        service.findAll({ isEffect: true, isFlip: false, isPendulum: true, isToken: false, skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.isEffect).toBe(true);
        expect(where.isFlip).toBe(false);
        expect(where.isPendulum).toBe(true);
        expect(where.isToken).toBe(false);
      });
    });

    describe('buildWhere — combined filters', () => {
      it('combines multiple filters into a single where clause', () => {
        service.findAll({
          cardType: ['MONSTER'],
          attribute: ['DARK', 'LIGHT'],
          atkMin: 2000,
          isTuner: true,
          q: 'dragon',
          skip: 0,
          take: 20,
        });

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.cardType).toEqual({ in: ['MONSTER'] });
        expect(where.attribute).toEqual({ in: ['DARK', 'LIGHT'] });
        expect(where.atk).toEqual({ gte: 2000 });
        expect(where.isTuner).toBe(true);
        expect(where.OR).toEqual([
          { name: { contains: 'dragon', mode: 'insensitive' } },
          { description: { contains: 'dragon', mode: 'insensitive' } },
        ]);
      });
    });
  });
});
