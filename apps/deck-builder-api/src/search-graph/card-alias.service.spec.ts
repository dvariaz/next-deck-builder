import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CardAliasService } from './card-alias.service';

/**
 * The index is fed real card text rather than pre-parsed alias objects, so
 * these specs cover the boot path end to end: query -> parse -> zone filter.
 */
const CARDS = [
  {
    id: 1,
    // Unconditional: true even in the Deck.
    description: '(This card is always treated as "Fallen of Albaz".)',
  },
  {
    id: 2,
    // Conditional: NOT true in the Deck.
    description:
      'This card\'s name becomes "Red Dragon Archfiend" while on the field or in the GY.',
  },
  {
    id: 3,
    // A family rather than a card name.
    description: '(This card is always treated as a "Blue-Eyes" card.)',
  },
  {
    id: 4,
    // Same alias as card 2, but unconditional - proves the filter is per-entry.
    description: '(This card is always treated as "Red Dragon Archfiend".)',
  },
  { id: 5, description: 'Add 1 card from your Deck to your hand.' },
];

const findMany = jest.fn();

describe('CardAliasService', () => {
  let service: CardAliasService;

  beforeEach(async () => {
    findMany.mockResolvedValue(CARDS);
    const module = await Test.createTestingModule({
      providers: [
        CardAliasService,
        { provide: PrismaService, useValue: { card: { findMany } } },
      ],
    }).compile();

    service = module.get(CardAliasService);
    await service.onModuleInit();
  });

  afterEach(() => jest.clearAllMocks());

  it('indexes only the cards that actually grant an alias', () => {
    // Four aliases from five cards: the last one has no alias phrasing.
    expect(service.size).toBe(4);
  });

  it('scans only candidate descriptions, not the whole pool', () => {
    // ~700 rows instead of 14,353. The boot cost is what makes an in-memory
    // index viable at all.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { description: { contains: 'treated as' } },
            { description: { contains: 'name becomes' } },
          ],
        },
      }),
    );
  });

  describe('forName', () => {
    it('finds a card by an unconditional alias, including from the Deck', () => {
      expect(service.forName('Fallen of Albaz', ['DECK'])).toEqual([
        { cardId: 1, aliasName: 'Fallen of Albaz' },
      ]);
    });

    it('is case-insensitive on the requested name', () => {
      expect(service.forName('fallen of albaz', ['DECK'])).toHaveLength(1);
    });

    it('honours the zone condition', () => {
      // Card 2 is only "Red Dragon Archfiend" on the field or in the GY, so a
      // Deck search must see card 4 alone.
      expect(service.forName('Red Dragon Archfiend', ['DECK'])).toEqual([
        { cardId: 4, aliasName: 'Red Dragon Archfiend' },
      ]);

      expect(
        service.forName('Red Dragon Archfiend', ['GY']).map((h) => h.cardId),
      ).toEqual([2, 4]);
    });

    it('treats a named field zone as being on the field', () => {
      expect(
        service.forName('Red Dragon Archfiend', ['MONSTER_ZONE']),
      ).toContainEqual({ cardId: 2, aliasName: 'Red Dragon Archfiend' });
    });

    it('matches only unconditional aliases when the effect names no zone', () => {
      // Guessing here is the one mistake worth avoiding: it would make every
      // conditional alias searchable everywhere.
      expect(service.forName('Red Dragon Archfiend', [])).toEqual([
        { cardId: 4, aliasName: 'Red Dragon Archfiend' },
      ]);
    });

    it('returns nothing for a name no card is treated as', () => {
      expect(service.forName('Dark Magician', ['DECK'])).toEqual([]);
    });
  });

  describe('containing', () => {
    it('matches a family alias by substring', () => {
      expect(service.containing('Blue-Eyes', ['DECK'])).toEqual([
        { cardId: 3, aliasName: 'Blue-Eyes' },
      ]);
    });

    it('applies the same zone rule as forName', () => {
      expect(
        service.containing('Red Dragon', ['DECK']).map((h) => h.cardId),
      ).toEqual([4]);
      expect(
        service.containing('Red Dragon', ['FIELD']).map((h) => h.cardId),
      ).toEqual([2, 4]);
    });

    it('never matches everything on an empty fragment', () => {
      // A predicate with no name or archetype must contribute no alias arm.
      expect(service.containing('', ['DECK'])).toEqual([]);
    });
  });

  it('rebuilds the index on refresh', async () => {
    findMany.mockResolvedValue([]);
    await service.refresh();
    expect(service.size).toBe(0);
    expect(service.forName('Fallen of Albaz', ['DECK'])).toEqual([]);
  });
});
