import { CardType } from '../../generated/prisma/enums';
import type { ParserContext } from './card-effect.types';
import { parseModifiers } from './modifiers';
import { preprocess } from './normalize';

const ctx: ParserContext = {
  archetypes: new Set(['Qli', 'Amazoness', 'HERO']),
  races: new Set(['Warrior', 'Dragon', 'Machine']),
  cardName: 'Test Card',
  cardType: CardType.MONSTER,
};

const mods = (raw: string) => {
  const { masked, names } = preprocess(raw);
  return parseModifiers(masked, names, ctx);
};

describe('modifiers', () => {
  describe('stat changes', () => {
    it('reads a flat ATK gain', () => {
      expect(mods('This card gains 500 ATK')).toMatchObject([
        {
          kind: 'STAT',
          stat: 'ATK',
          mode: 'GAIN',
          amount: 500,
          target: { kind: 'self' },
        },
      ]);
    });

    it('reports a computed amount as VARIABLE rather than guessing', () => {
      // "for each" makes the number depend on board state. Recording the 500
      // from "500 ATK for each ..." would be a wrong fact.
      expect(
        mods('This card gains 500 ATK for each Dragon monster you control'),
      ).toMatchObject([{ kind: 'STAT', amount: 'VARIABLE' }]);
    });

    it('separates losing ATK from having it overwritten', () => {
      // A ruling difference: a monster whose ATK BECOMES 0 has lost its
      // original value, one that LOSES ATK has not.
      expect(mods('it loses 700 ATK')).toMatchObject([{ mode: 'LOSE' }]);
      expect(mods('its ATK becomes 100')).toMatchObject([{ mode: 'BECOMES' }]);
    });

    it('reads ATK and DEF together as one stat', () => {
      expect(mods('its ATK and DEF become 100')).toMatchObject([
        { stat: 'ATK_AND_DEF', mode: 'BECOMES', amount: 100 },
      ]);
    });

    it('reads Level and Pendulum Scale', () => {
      expect(mods("this card's Level becomes 4")).toMatchObject([
        { stat: 'LEVEL' },
      ]);
      expect(mods('Reduce its Pendulum Scale by 3')).toMatchObject([
        { stat: 'PENDULUM_SCALE', mode: 'LOSE' },
      ]);
    });

    it('keeps a duration verbatim', () => {
      expect(mods('its ATK becomes 100 until the End Phase')).toMatchObject([
        { duration: 'until the End Phase' },
      ]);
    });

    it('leaves duration undefined for an open-ended state', () => {
      expect(mods('This card gains 500 ATK')[0].duration).toBeUndefined();
    });
  });

  describe('who the state applies to', () => {
    it('defaults to this card', () => {
      expect(mods('This card gains 500 ATK')[0].target).toEqual({
        kind: 'self',
      });
    });

    it('reads an archetype subject into a queryable predicate', () => {
      expect(mods('All "Qli" monsters you control gain 300 ATK')).toMatchObject(
        [
          {
            kind: 'STAT',
            amount: 300,
            target: { kind: 'criteria', predicate: { archetype: 'Qli' } },
          },
        ],
      );
    });

    it('reports "the equipped monster" as unresolved, not as this card', () => {
      // On an Equip Spell this is whichever monster the card is attached to,
      // which is only knowable at runtime. `self` would be plainly wrong, and
      // a criteria on "monster" would claim the state applies to every monster.
      expect(mods('The equipped monster cannot attack')).toMatchObject([
        {
          kind: 'CANNOT_ATTACK',
          target: { kind: 'unresolved', text: 'equipped monster' },
        },
      ]);
    });
  });

  describe('protection and restriction states', () => {
    it('reads indestructibility', () => {
      expect(
        mods(
          'Other "Amazoness" cards you control cannot be destroyed by battle or card effects',
        ),
      ).toMatchObject([{ kind: 'INDESTRUCTIBLE' }]);
    });

    it('reads untargetability', () => {
      expect(
        mods("This card cannot be targeted by your opponent's card effects"),
      ).toMatchObject([{ kind: 'UNTARGETABLE' }]);
    });

    it('reads "unaffected"', () => {
      expect(
        mods('This card is unaffected by other monsters’ effects'),
      ).toMatchObject([{ kind: 'UNAFFECTED' }]);
    });

    it('reads a summon lock', () => {
      expect(
        mods('You cannot Special Summon monsters, except "Qli" monsters'),
      ).toMatchObject([{ kind: 'SUMMON_LOCK' }]);
    });

    it('reads an activation lock', () => {
      expect(
        mods(
          'you cannot activate cards, or the effects of cards, with that name',
        ),
      ).toMatchObject([{ kind: 'ACTIVATION_LOCK' }]);
    });

    it('reads attack restrictions and grants apart', () => {
      expect(mods('This card cannot attack')).toMatchObject([
        { kind: 'CANNOT_ATTACK' },
      ]);
      expect(mods('they must attack this turn, if able')).toMatchObject([
        { kind: 'MUST_ATTACK' },
      ]);
      expect(mods('this card can attack directly')).toMatchObject([
        { kind: 'CAN_ATTACK_DIRECTLY' },
      ]);
    });

    it('reads a material restriction', () => {
      expect(
        mods('Cannot be used as Link Material the turn it is Link Summoned'),
      ).toMatchObject([{ kind: 'CANNOT_BE_MATERIAL' }]);
    });

    it('reads an identity grant', () => {
      expect(mods('it is treated as an "Amazoness" monster')).toMatchObject([
        { kind: 'TREATED_AS' },
      ]);
    });
  });

  describe('segments that state no continuous effect', () => {
    it('returns nothing for an ordinary search', () => {
      expect(mods('Add 1 "HERO" monster from your Deck to your hand')).toEqual(
        [],
      );
    });

    it('returns nothing for a summon', () => {
      expect(mods('Special Summon 1 Warrior monster from your hand')).toEqual(
        [],
      );
    });

    it('returns nothing for a draw', () => {
      expect(mods('Draw 2 cards')).toEqual([]);
    });
  });

  describe('two states in one segment', () => {
    it('records a stat change alongside a restriction', () => {
      // Stage 3 usually splits these, but a bare "and" does not split, so one
      // segment can carry both.
      expect(
        mods('The equipped monster cannot attack and its ATK becomes 100'),
      ).toMatchObject([
        { kind: 'STAT', stat: 'ATK', mode: 'BECOMES' },
        { kind: 'CANNOT_ATTACK' },
      ]);
    });
  });

  describe('audit trail', () => {
    it('keeps the clause it came from, unmasked', () => {
      expect(
        mods('All "Qli" monsters you control gain 300 ATK')[0].sourceText,
      ).toBe('All Qli monsters you control gain 300 ATK');
    });
  });
});
