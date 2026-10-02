import { parseAction, parseSelection, segmentRejection } from './actions';
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

/**
 * Parse a resolution segment together with the clause that precedes it, which
 * is where modern text states the noun phrase a pronoun refers back to.
 */
const actInClause = (clauseContext: string, segment: string) => {
  // Masked as one string so quoted names get the same indexes the real
  // pipeline would give them, then split at the LAST separator — the context
  // may contain separators of its own.
  const { masked, names } = preprocess(`${clauseContext}; ${segment}`);
  const at = masked.lastIndexOf('; ');
  return parseAction(masked.slice(at + 2), names, ctx, {
    clauseContext: masked.slice(0, at),
  });
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

  describe('selection mode — target vs choose vs select', () => {
    it('reads explicit targeting', () => {
      expect(parseSelection('Target 1 monster in either GY')).toBe('TARGET');
      expect(
        parseSelection('You can target 1 card your opponent controls'),
      ).toBe('TARGET');
    });

    it('reads PSCT non-targeting selection', () => {
      expect(parseSelection('choose 1 Spell Card from your Deck')).toBe(
        'CHOOSE',
      );
    });

    it('reports legacy "select" as its own, undetermined value', () => {
      // Konami's errata programme rewrote pre-2011 "select" into either
      // "target" or "choose" case by case, and the printed text of an
      // un-errata'd card does not say which. Guessing would be wrong about
      // half the time.
      expect(parseSelection('Select 1 Trap Card on the field')).toBe(
        'LEGACY_SELECT',
      );
    });

    it('reports NONE when the text names no selection', () => {
      expect(
        parseSelection('Add 1 Field Spell from your Deck to your hand'),
      ).toBe('NONE');
    });

    it('prefers "target" when a clause uses more than one word', () => {
      expect(parseSelection('Target 1 monster; choose its position')).toBe(
        'TARGET',
      );
    });

    it('puts the mode on the action', () => {
      expect(
        act('Special Summon 1 Warrior monster from your Deck'),
      ).toMatchObject({ selection: 'NONE' });
    });
  });

  describe('pronoun resolutions — the noun phrase is in the preceding clause', () => {
    it('resolves "Special Summon it" from the targeting clause', () => {
      // Monster Reborn. 2,099 cards in the pool state what they act on before
      // the semicolon and refer back to it by pronoun.
      expect(
        actInClause('Target 1 monster in either GY', 'Special Summon it.'),
      ).toMatchObject({
        verb: 'SPECIAL_SUMMON',
        selection: 'TARGET',
        resolved: true,
        sourceZones: [{ zone: 'GY', owner: 'EITHER' }],
        target: { kind: 'criteria', label: '1 monster' },
      });
    });

    it('takes the zone from the clause that names the noun phrase', () => {
      // Alchemic Magician: the Deck is the source, the S/T Zone is where the
      // card goes. Reading "in your Spell & Trap Card Zone" as the source
      // would make this card look like it searches its own backrow.
      expect(
        actInClause(
          'choose 1 Spell Card from your Deck',
          'then Set it in your Spell & Trap Card Zone.',
        ),
      ).toMatchObject({
        verb: 'SET',
        selection: 'CHOOSE',
        resolved: true,
        sourceZones: [{ zone: 'DECK', owner: 'SELF' }],
        destination: 'FIELD_FACE_DOWN',
        target: { kind: 'criteria', label: '1 Spell Card' },
      });
    });

    it('uses the nearest antecedent when a clause has two', () => {
      expect(
        actInClause(
          'target 1 monster you control; choose 1 Warrior monster from your Deck',
          'Special Summon it.',
        ),
      ).toMatchObject({
        sourceZones: [{ zone: 'DECK', owner: 'SELF' }],
        target: { kind: 'criteria', label: '1 Warrior monster' },
      });
    });

    it('leaves a pronoun unresolved when there is no antecedent', () => {
      expect(
        actInClause('You can discard 1 card', 'Special Summon it.'),
      ).toMatchObject({ resolved: false, target: { kind: 'unresolved' } });
    });

    it('does not borrow when the resolution names its own noun phrase', () => {
      expect(
        actInClause(
          'target 1 monster in your GY',
          'Special Summon 1 Warrior monster from your Deck.',
        ),
      ).toMatchObject({
        sourceZones: [{ zone: 'DECK', owner: 'SELF' }],
        target: { kind: 'criteria', label: '1 Warrior monster' },
      });
    });
  });

  describe('legacy verb spellings', () => {
    it('reads "pick up and see" as an excavate', () => {
      expect(act('pick up and see the top card of your Deck')).toMatchObject({
        verb: 'EXCAVATE',
      });
    });

    it('reads "show" as a reveal', () => {
      expect(
        act('show up to 2 Normal Monster Cards from your hand'),
      ).toMatchObject({ verb: 'REVEAL' });
    });

    it('does not read "show" without a count as a verb', () => {
      expect(act('show your opponent')).toBeUndefined();
    });

    it('reads "Set it" as a Set, not as the adjective', () => {
      expect(
        actInClause('choose 1 Spell Card from your Deck', 'Set it.'),
      ).toMatchObject({ verb: 'SET' });
    });

    it('still refuses "Set" as an adjective', () => {
      expect(
        act("1 Set card in your opponent's Spell & Trap Zone"),
      ).toBeUndefined();
    });
  });

  describe('the field stated as control', () => {
    it('reads "your opponent controls" as their field', () => {
      expect(
        actInClause('target 1 monster your opponent controls', 'destroy it.'),
      ).toMatchObject({
        sourceZones: [{ zone: 'FIELD', owner: 'OPPONENT' }],
      });
    });

    it('reads "you control" as your field', () => {
      expect(
        actInClause('target 1 monster you control', 'destroy it.'),
      ).toMatchObject({ sourceZones: [{ zone: 'FIELD', owner: 'SELF' }] });
    });
  });

  describe('legacy "Card Zone" spellings', () => {
    it('folds "Spell & Trap Card Zone" onto the modern zone', () => {
      expect(
        actInClause(
          'choose 1 Continuous Spell in your Spell & Trap Card Zone',
          'destroy it.',
        ),
      ).toMatchObject({ sourceZones: [{ zone: 'ST_ZONE', owner: 'SELF' }] });
    });
  });

  describe('segmentRejection — declined, not failed', () => {
    it('reports a negation', () => {
      expect(
        segmentRejection('you cannot Special Summon monsters this turn'),
      ).toBe('NEGATION');
    });

    it('reports a passive description', () => {
      expect(
        segmentRejection('a monster is Special Summoned from your Deck'),
      ).toBe('PASSIVE');
    });

    it('reports nothing for a real action', () => {
      expect(
        segmentRejection('Add 1 Field Spell from your Deck to your hand'),
      ).toBeUndefined();
    });
  });
});
