import { parseAction } from './actions';
import type { ParserContext } from './card-effect.types';
import { preprocess } from './normalize';

const ctx: ParserContext = {
  archetypes: new Set(['HERO', 'Sky Striker Ace', 'Trickstar']),
  races: new Set(['Warrior', 'Spellcaster', 'Psychic', 'Dragon']),
  cardName: 'Test Card',
};

const act = (
  raw: string,
  cardName = ctx.cardName,
  inheritedExcept?: string[],
) => {
  const { masked, names } = preprocess(raw);
  return parseAction(masked, names, { ...ctx, cardName }, { inheritedExcept });
};

describe('actions', () => {
  describe('guards — segments that must yield nothing', () => {
    it('rejects a negated summon (Snake-Eyes Ash’s lock)', () => {
      expect(
        act(
          'you cannot Special Summon monsters for the rest of this turn, except FIRE monsters',
        ),
      ).toBeUndefined();
    });

    it('rejects "neither player can ..." — a negative without "cannot"', () => {
      // Amorphage Envy: "neither player can Special Summon monsters from the
      // Extra Deck". 79 cards use this phrasing and it has no "cannot" in it.
      expect(
        act('neither player can Special Summon monsters from the Extra Deck'),
      ).toBeUndefined();
    });

    it('rejects "it cannot attack"', () => {
      expect(act('it cannot attack')).toBeUndefined();
    });

    it('rejects passive voice — a condition, not an action', () => {
      expect(
        act('a monster is Special Summoned from your Deck'),
      ).toBeUndefined();
      expect(act('it is destroyed during the End Phase')).toBeUndefined();
    });

    it('rejects a segment with no verb at all', () => {
      expect(act('you take no battle damage')).toBeUndefined();
    });

    it('does not read "Set" used as an adjective as the Set verb', () => {
      // Trickstar Light Stage: "target 1 Set card in your opponent's S/T Zone"
      const action = act(
        "target 1 Set card in your opponent's Spell & Trap Zone",
      );
      expect(action?.verb).not.toBe('SET');
    });
  });

  describe('verb, zone and destination', () => {
    it('reads a deck search', () => {
      const action = act(
        'Add 1 Level 4 or lower Warrior monster from your Deck to your hand.',
      );
      expect(action).toMatchObject({
        verb: 'ADD',
        sourceZones: [{ zone: 'DECK', owner: 'SELF' }],
        destination: 'HAND',
        resolved: true,
      });
    });

    it('reads a Field Spell search', () => {
      expect(
        act('Add 1 Field Spell from your Deck to your hand.'),
      ).toMatchObject({
        verb: 'ADD',
        target: {
          predicate: { cardType: ['SPELL'], spellTrapSubType: ['FIELD'] },
        },
      });
    });

    it('reads an Extra Deck Special Summon to the Extra Monster Zone', () => {
      // Sky Striker Ace - Raye. The destination is a zone name, not "the field".
      expect(
        act(
          'Special Summon 1 "Sky Striker Ace" monster from your Extra Deck to the Extra Monster Zone.',
        ),
      ).toMatchObject({
        verb: 'SPECIAL_SUMMON',
        sourceZones: [{ zone: 'EXTRA_DECK', owner: 'SELF' }],
        destination: 'FIELD_FACE_UP',
        resolved: true,
      });
    });

    it('distinguishes Extra Deck from Deck', () => {
      expect(
        act('Special Summon 1 Fusion Monster from your Extra Deck.')
          ?.sourceZones,
      ).toEqual([{ zone: 'EXTRA_DECK', owner: 'SELF' }]);
    });

    it('reads a mill as SEND to the GY', () => {
      expect(act('Send 1 monster from your Deck to the GY.')).toMatchObject({
        verb: 'SEND',
        sourceZones: [{ zone: 'DECK', owner: 'SELF' }],
        destination: 'GY',
      });
    });

    it('reclassifies "Send ... to the hand" as a bounce', () => {
      expect(act('Send 1 monster from the field to the hand.')?.verb).toBe(
        'RETURN',
      );
    });

    it('defaults a Set to face-down on the field', () => {
      expect(act('Set 1 "Trickstar" Spell from your Deck.')).toMatchObject({
        verb: 'SET',
        destination: 'FIELD_FACE_DOWN',
      });
    });

    it('treats a face-down summon as face-down', () => {
      expect(
        act(
          'Special Summon 1 Warrior monster from your Deck in face-down Defense Position.',
        ),
      ).toMatchObject({ destination: 'FIELD_FACE_DOWN' });
    });
  });

  describe('multiple source zones', () => {
    it('reads "from your hand or Deck"', () => {
      // Emergency Teleport — genuinely both a hand extender and a deck summon.
      expect(
        act(
          'Special Summon 1 Level 3 or lower Psychic-Type monster from your hand or Deck',
        ),
      ).toMatchObject({
        sourceZones: [
          { zone: 'HAND', owner: 'SELF' },
          { zone: 'DECK', owner: 'SELF' },
        ],
      });
    });

    it('reads a three-way alternation', () => {
      expect(
        act('Banish 1 monster from your hand, Deck, or GY')?.sourceZones,
      ).toEqual([
        { zone: 'HAND', owner: 'SELF' },
        { zone: 'DECK', owner: 'SELF' },
        { zone: 'GY', owner: 'SELF' },
      ]);
    });
  });

  describe('zone ownership', () => {
    it('reads "in either GY"', () => {
      expect(act('Special Summon 1 monster in either GY')?.sourceZones).toEqual(
        [{ zone: 'GY', owner: 'EITHER' }],
      );
    });

    it("reads your opponent's zone", () => {
      expect(
        act("Banish 1 monster from your opponent's GY")?.sourceZones,
      ).toEqual([{ zone: 'GY', owner: 'OPPONENT' }]);
    });

    it('reads banished cards as a zone', () => {
      expect(
        act('Add 1 banished Warrior monster to your hand')?.sourceZones,
      ).toEqual([{ zone: 'BANISHED', owner: 'SELF' }]);
    });
  });

  describe('noun phrase extraction', () => {
    it('cuts the phrase at the zone, not at the destination', () => {
      const action = act(
        'Add 1 Level 4 or lower Warrior monster from your Deck to your hand.',
      );
      expect(action?.target).toMatchObject({
        label: '1 Level 4 or lower Warrior monster',
      });
    });

    it('cuts at the destination when no source zone is named', () => {
      const action = act('Return 1 Warrior monster to the hand.');
      expect(action?.target).toMatchObject({ label: '1 Warrior monster' });
    });
  });

  describe('resolution — the fail-safe rules', () => {
    it('refuses a search with an unconstrained target', () => {
      // Ash Blossom's quoted bullet.
      expect(act('Add a card from the Deck to the hand.')?.resolved).toBe(
        false,
      );
    });

    it('refuses a search with no source zone', () => {
      expect(act('Add 1 Warrior monster to your hand.')?.resolved).toBe(false);
    });

    it('still records the action so it is visible in the IR', () => {
      const action = act('Add a card from the Deck to the hand.');
      expect(action?.verb).toBe('ADD');
      expect(action?.target.kind).toBe('unresolved');
    });

    it('exempts "this card" from the source-zone requirement', () => {
      expect(act('Special Summon this card')).toMatchObject({
        target: { kind: 'self' },
        resolved: true,
      });
    });
  });

  describe('exclusions', () => {
    it('applies an exclusion found after the destination', () => {
      const action = act(
        'add 1 Level 1 FIRE monster from your Deck to your hand, except "Snake-Eyes Ash"',
        'Snake-Eyes Ash',
        ['Snake-Eyes Ash'],
      );
      expect(action?.target).toMatchObject({
        predicate: { excludeNames: ['Snake-Eyes Ash'] },
      });
    });
  });

  describe('sourceText', () => {
    it('keeps the verbatim clause with names restored', () => {
      const action = act('Add 1 "HERO" monster from your Deck to your hand.');
      expect(action?.sourceText).toBe(
        'Add 1 HERO monster from your Deck to your hand.',
      );
    });
  });
});
