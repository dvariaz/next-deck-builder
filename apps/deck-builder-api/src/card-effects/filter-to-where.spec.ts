import { filterToWhere } from './filter-to-where';
import type { CardFilter } from '../psct-parser/ast';

describe('filterToWhere', () => {
  it('translates the columns a search actually keys on', () => {
    const filter: CardFilter = {
      cardType: ['MONSTER'],
      attribute: ['DARK'],
      race: ['Warrior'],
      levelMax: 4,
    };

    expect(filterToWhere(filter)).toEqual({
      cardType: { in: ['MONSTER'] },
      attribute: { in: ['DARK'] },
      race: { in: ['Warrior'] },
      level: { lte: 4 },
    });
  });

  it('builds a closed range from both bounds', () => {
    expect(filterToWhere({ levelMin: 5, levelMax: 8 })).toEqual({
      level: { gte: 5, lte: 8 },
    });
  });

  it('treats 0 as a real bound, not as absent', () => {
    // A monster can have 0 ATK and "0 or less ATK" is real printed text, so a
    // falsiness check here would silently drop the constraint.
    expect(filterToWhere({ atkMax: 0 })).toEqual({ atk: { lte: 0 } });
  });

  it('emits no clause for a field the text never mentioned', () => {
    // The decisive property: an absent field means "not constrained", never
    // "zero". A spurious clause would narrow the result set and turn a missing
    // fact into a wrong one.
    expect(filterToWhere({ cardType: ['SPELL'] })).toEqual({
      cardType: { in: ['SPELL'] },
    });
  });

  it('matches an archetype exactly but a fallback name by substring', () => {
    // `archetype` is only set once the parser has validated the quoted token
    // against the pool's own vocabulary; `nameContains` is the degraded
    // fallback for a token that is not a known archetype.
    expect(filterToWhere({ archetype: 'HERO' })).toEqual({
      archetype: 'HERO',
    });
    expect(filterToWhere({ nameContains: 'Dark Magician' })).toEqual({
      name: { contains: 'Dark Magician', mode: 'insensitive' },
    });
  });

  it('scopes excluded names to this clause, not the whole query', () => {
    // From `except "X"`. As a top-level NOT it would exclude those cards from
    // an entire query rather than from the one family the text carved them out
    // of.
    const where = filterToWhere({
      archetype: 'HERO',
      excludeNames: ['Elemental HERO Neos'],
    })!;

    expect(where.archetype).toBe('HERO');
    expect(where.NOT).toEqual([{ name: 'Elemental HERO Neos' }]);
  });

  it('returns null for a filter that constrains nothing', () => {
    // Not `{}`. An empty where matches every card in the game, so returning one
    // would claim the card can fetch anything — the exact class of wrong fact
    // the parser is built to avoid.
    expect(filterToWhere({})).toBeNull();
  });

  it('does not count an exclusion alone as a constraint', () => {
    // "any card except X" is not a search the database can usefully answer;
    // it still matches ~14,000 rows.
    expect(filterToWhere({ excludeNames: ['Pot of Greed'] })).toBeNull();
  });
});
