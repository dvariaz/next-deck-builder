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

      it('builds exact match for attribute', () => {
        service.findAll({ attribute: 'DARK', skip: 0, take: 20 });

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.attribute).toBe('DARK');
      });

      it('builds exact match for race', () => {
        service.findAll({ race: 'Dragon', skip: 0, take: 20 });

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.race).toBe('Dragon');
      });
    });

    describe('buildWhere — enum filters', () => {
      it('filters by cardType', () => {
        service.findAll({ cardType: 'MONSTER', skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.cardType).toBe('MONSTER');
      });

      it('filters by frameType', () => {
        service.findAll({ frameType: 'FUSION', skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.frameType).toBe('FUSION');
      });

      it('filters by summonType', () => {
        service.findAll({ summonType: 'SYNCHRO', skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.summonType).toBe('SYNCHRO');
      });

      it('filters by monsterEffectType', () => {
        service.findAll({ monsterEffectType: 'EFFECT', skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.monsterEffectType).toBe('EFFECT');
      });

      it('filters by spellTrapSubType', () => {
        service.findAll({ spellTrapSubType: 'QUICK_PLAY', skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.spellTrapSubType).toBe('QUICK_PLAY');
      });

      it('filters by banStatusTcg', () => {
        service.findAll({ banStatusTcg: 'FORBIDDEN', skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.banStatusTcg).toBe('FORBIDDEN');
      });

      it('filters by banStatusOcg', () => {
        service.findAll({ banStatusOcg: 'LIMITED', skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.banStatusOcg).toBe('LIMITED');
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

      it('builds level range filter', () => {
        service.findAll({ levelMin: 4, levelMax: 8, skip: 0, take: 20 });
        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.level).toEqual({ gte: 4, lte: 8 });
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
          cardType: 'MONSTER',
          attribute: 'DARK',
          atkMin: 2000,
          isTuner: true,
          name: 'dragon',
          skip: 0,
          take: 20,
        });

        const { where } = mockFindMany.mock.calls[0][0];
        expect(where.cardType).toBe('MONSTER');
        expect(where.attribute).toBe('DARK');
        expect(where.atk).toEqual({ gte: 2000 });
        expect(where.isTuner).toBe(true);
        expect(where.name).toEqual({ contains: 'dragon', mode: 'insensitive' });
      });
    });
  });
});
