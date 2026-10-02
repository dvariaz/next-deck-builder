import { splitClause, splitResolutions } from './clauses';

describe('clauses', () => {
  describe('splitClause — shapes', () => {
    it('treats a bare sentence as all resolution', () => {
      const c = splitClause(
        'Add 1 Level 4 or lower Warrior monster from your Deck to your hand.',
      );
      expect(c.trigger).toBeUndefined();
      expect(c.cost).toBeUndefined();
      expect(c.resolutions).toEqual([
        'Add 1 Level 4 or lower Warrior monster from your Deck to your hand.',
      ]);
    });

    it('splits condition : resolution', () => {
      const c = splitClause(
        'If this card is sent from the field to the GY: Add 1 monster from your Deck to your hand.',
      );
      expect(c.trigger).toBe('If this card is sent from the field to the GY');
      expect(c.cost).toBeUndefined();
      expect(c.resolutions).toEqual([
        'Add 1 monster from your Deck to your hand.',
      ]);
    });

    it('splits cost ; resolution when there is no condition', () => {
      const c = splitClause(
        'Pay 1000 LP; Special Summon 1 Level 5 or lower Fusion Monster from your Extra Deck.',
      );
      expect(c.trigger).toBeUndefined();
      expect(c.cost).toBe('Pay 1000 LP');
      expect(c.resolutions).toEqual([
        'Special Summon 1 Level 5 or lower Fusion Monster from your Extra Deck.',
      ]);
    });

    it('splits condition : cost ; resolution', () => {
      const c = splitClause(
        '(Quick Effect): You can Tribute this card; Special Summon 1 monster from your Extra Deck.',
      );
      expect(c.trigger).toBe('(Quick Effect)');
      expect(c.cost).toBe('You can Tribute this card');
      expect(c.resolutions).toEqual([
        'Special Summon 1 monster from your Extra Deck.',
      ]);
    });

    it('does not invent a trigger when a semicolon precedes the colon', () => {
      const c = splitClause('Discard 1 card; apply this effect: draw 2 cards.');
      expect(c.trigger).toBeUndefined();
      expect(c.cost).toBe('Discard 1 card');
    });
  });

  describe('splitClause — the ", but" split (940 cards depend on it)', () => {
    it('isolates Sangan’s trailing restriction from its search', () => {
      const c = splitClause(
        'If this card is sent from the field to the GY: Add 1 monster with 1500 or less ATK from your Deck to your hand, but you cannot activate cards, or the effects of cards, with that name for the rest of this turn.',
      );
      expect(c.resolutions).toEqual([
        'Add 1 monster with 1500 or less ATK from your Deck to your hand',
        'you cannot activate cards, or the effects of cards, with that name for the rest of this turn.',
      ]);
    });

    it('isolates Instant Fusion’s two trailing drawbacks', () => {
      const c = splitClause(
        'Pay 1000 LP; Special Summon 1 Level 5 or lower Fusion Monster from your Extra Deck, but it cannot attack, also it is destroyed during the End Phase.',
      );
      expect(c.resolutions).toEqual([
        'Special Summon 1 Level 5 or lower Fusion Monster from your Extra Deck',
        'it cannot attack',
        'it is destroyed during the End Phase.',
      ]);
    });

    it('isolates a summon lock from the search it follows', () => {
      const c = splitClause(
        'You can discard 1 other card; add 1 Level 1 FIRE monster from your Deck to your hand, also you cannot Special Summon monsters for the rest of this turn, except FIRE monsters.',
      );
      expect(c.cost).toBe('You can discard 1 other card');
      expect(c.resolutions).toEqual([
        'add 1 Level 1 FIRE monster from your Deck to your hand',
        'you cannot Special Summon monsters for the rest of this turn, except FIRE monsters.',
      ]);
    });
  });

  describe('splitResolutions — chaining', () => {
    it('splits ", and if you do," into two real actions', () => {
      expect(
        splitResolutions(
          'Special Summon the revealed monster, and if you do, add 1 Cyberse monster from your Deck to your hand.',
        ),
      ).toEqual([
        'Special Summon the revealed monster',
        'add 1 Cyberse monster from your Deck to your hand.',
      ]);
    });

    it('splits ", then" into two real actions', () => {
      expect(
        splitResolutions(
          'Send 1 card from your Deck to the GY, then add 1 monster from your Deck to your hand.',
        ),
      ).toEqual([
        'Send 1 card from your Deck to the GY',
        'add 1 monster from your Deck to your hand.',
      ]);
    });

    it('splits ", after that"', () => {
      expect(
        splitResolutions('Draw 2 cards, after that, discard 1 card.'),
      ).toEqual(['Draw 2 cards', 'discard 1 card.']);
    });

    it('does NOT split a noun phrase joined by "or"', () => {
      expect(
        splitResolutions(
          'Add 1 Warrior or Spellcaster monster from your Deck to your hand.',
        ),
      ).toHaveLength(1);
    });

    it('does NOT split a list joined by "and"', () => {
      expect(
        splitResolutions('Destroy 1 monster and 1 Spell on the field.'),
      ).toHaveLength(1);
    });
  });

  describe('splitClause — optional', () => {
    it('marks "You can" in the resolution as optional', () => {
      expect(
        splitClause(
          'When this card is activated: You can add 1 monster from your Deck to your hand.',
        ).optional,
      ).toBe(true);
    });

    it('marks "You can" in the cost as optional', () => {
      expect(
        splitClause('You can discard 1 card; draw 2 cards.').optional,
      ).toBe(true);
    });

    it('is not optional when the effect is mandatory', () => {
      expect(
        splitClause('Add 1 Field Spell from your Deck to your hand.').optional,
      ).toBe(false);
    });

    it('ignores "you can" appearing only in the trigger', () => {
      // The trigger describes circumstances, not a choice to perform the effect.
      expect(
        splitClause(
          'While this card is face-up on the field, you can Normal Summon it: Draw 1 card.',
        ).optional,
      ).toBe(false);
    });
  });
});
