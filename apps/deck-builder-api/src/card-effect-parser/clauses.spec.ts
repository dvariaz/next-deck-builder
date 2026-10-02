import { TriggerTiming } from './card-effect.types';
import {
  parseTiming,
  splitClause,
  splitResolutions,
  type ResolutionSegment,
} from './clauses';

/** The segment bodies, for assertions that do not care about conjunctions. */
const texts = (segments: ResolutionSegment[]) => segments.map((s) => s.text);

describe('clauses', () => {
  describe('splitClause — shapes', () => {
    it('treats a bare sentence as all resolution', () => {
      const c = splitClause(
        'Add 1 Level 4 or lower Warrior monster from your Deck to your hand.',
      );
      expect(c.trigger).toBeUndefined();
      expect(c.cost).toBeUndefined();
      expect(c.resolutions.map((r) => r.text)).toEqual([
        'Add 1 Level 4 or lower Warrior monster from your Deck to your hand.',
      ]);
    });

    it('splits condition : resolution', () => {
      const c = splitClause(
        'If this card is sent from the field to the GY: Add 1 monster from your Deck to your hand.',
      );
      expect(c.trigger).toBe('If this card is sent from the field to the GY');
      expect(c.cost).toBeUndefined();
      expect(c.resolutions.map((r) => r.text)).toEqual([
        'Add 1 monster from your Deck to your hand.',
      ]);
    });

    it('splits cost ; resolution when there is no condition', () => {
      const c = splitClause(
        'Pay 1000 LP; Special Summon 1 Level 5 or lower Fusion Monster from your Extra Deck.',
      );
      expect(c.trigger).toBeUndefined();
      expect(c.cost).toBe('Pay 1000 LP');
      expect(c.resolutions.map((r) => r.text)).toEqual([
        'Special Summon 1 Level 5 or lower Fusion Monster from your Extra Deck.',
      ]);
    });

    it('splits condition : cost ; resolution', () => {
      const c = splitClause(
        '(Quick Effect): You can Tribute this card; Special Summon 1 monster from your Extra Deck.',
      );
      expect(c.trigger).toBe('(Quick Effect)');
      expect(c.cost).toBe('You can Tribute this card');
      expect(c.resolutions.map((r) => r.text)).toEqual([
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
      expect(c.resolutions.map((r) => r.text)).toEqual([
        'Add 1 monster with 1500 or less ATK from your Deck to your hand',
        'you cannot activate cards, or the effects of cards, with that name for the rest of this turn.',
      ]);
    });

    it('isolates Instant Fusion’s two trailing drawbacks', () => {
      const c = splitClause(
        'Pay 1000 LP; Special Summon 1 Level 5 or lower Fusion Monster from your Extra Deck, but it cannot attack, also it is destroyed during the End Phase.',
      );
      expect(c.resolutions.map((r) => r.text)).toEqual([
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
      expect(c.resolutions.map((r) => r.text)).toEqual([
        'add 1 Level 1 FIRE monster from your Deck to your hand',
        'you cannot Special Summon monsters for the rest of this turn, except FIRE monsters.',
      ]);
    });
  });

  describe('splitResolutions — chaining', () => {
    it('splits ", and if you do," into two real actions', () => {
      expect(
        texts(
          splitResolutions(
            'Special Summon the revealed monster, and if you do, add 1 Cyberse monster from your Deck to your hand.',
          ),
        ),
      ).toEqual([
        'Special Summon the revealed monster',
        'add 1 Cyberse monster from your Deck to your hand.',
      ]);
    });

    it('splits ", then" into two real actions', () => {
      expect(
        texts(
          splitResolutions(
            'Send 1 card from your Deck to the GY, then add 1 monster from your Deck to your hand.',
          ),
        ),
      ).toEqual([
        'Send 1 card from your Deck to the GY',
        'add 1 monster from your Deck to your hand.',
      ]);
    });

    it('splits ", after that"', () => {
      expect(
        texts(splitResolutions('Draw 2 cards, after that, discard 1 card.')),
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

  describe('splitResolutions — which conjunction split it', () => {
    // Konami's conjunctions are a defined vocabulary: "then" and "and if you
    // do" make the later part conditional on the earlier one succeeding,
    // while "also" leaves the two independent.
    it('leaves the first segment with no conjunction', () => {
      expect(splitResolutions('Draw 2 cards, then discard 1 card.')[0]).toEqual(
        { text: 'Draw 2 cards', conjunction: 'NONE' },
      );
    });

    it('records "then"', () => {
      expect(
        splitResolutions('Draw 2 cards, then discard 1 card.')[1].conjunction,
      ).toBe('THEN');
    });

    it('records "and if you do"', () => {
      expect(
        splitResolutions('Draw 1 card, and if you do, discard 1 card.')[1]
          .conjunction,
      ).toBe('AND_IF_YOU_DO');
    });

    it('records "also"', () => {
      expect(
        splitResolutions('Draw 1 card, also gain 500 LP.')[1].conjunction,
      ).toBe('ALSO');
    });

    it('records "after that"', () => {
      expect(
        splitResolutions('Draw 2 cards, after that, discard 1 card.')[1]
          .conjunction,
      ).toBe('AFTER_THAT');
    });

    it('records "but"', () => {
      expect(
        splitResolutions(
          'Special Summon it, but it cannot attack this turn.',
        )[1].conjunction,
      ).toBe('BUT');
    });

    it('records each conjunction in a three-part chain', () => {
      expect(
        splitResolutions(
          'Draw 1 card, then discard 1 card, also gain 500 LP.',
        ).map((s) => s.conjunction),
      ).toEqual(['NONE', 'THEN', 'ALSO']);
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

  describe('trigger timing — the ruling distinction', () => {
    it('reads "When" and marks it as such', () => {
      const c = splitClause(
        'When this card is sent to the GY: You can add 1 monster from your Deck to your hand.',
      );
      expect(c.timing).toBe(TriggerTiming.WHEN);
    });

    it('reads "If"', () => {
      const c = splitClause(
        'If this card is sent to the GY: You can add 1 monster from your Deck to your hand.',
      );
      expect(c.timing).toBe(TriggerTiming.IF);
    });

    it('reads a bare window as DURING, not as an event', () => {
      const c = splitClause(
        'During your Main Phase: You can Special Summon 1 monster from your hand.',
      );
      expect(c.timing).toBe(TriggerTiming.DURING);
    });

    it('leaves timing undefined when there is no trigger', () => {
      expect(
        splitClause('Add 1 Field Spell from your Deck to your hand.').timing,
      ).toBeUndefined();
    });

    describe('parseTiming — which word governs', () => {
      it('lets "When" outrank a window it is nested in', () => {
        // Gladiator Beast Heraklinos: the window is DURING but the EVENT is
        // "when ... is activated", and the event decides timing-missing.
        expect(
          parseTiming(
            "During either player's turn, when a Spell/Trap Card is activated",
          ),
        ).toBe(TriggerTiming.WHEN);
      });

      it('keeps DURING when no event word is present', () => {
        expect(
          parseTiming(
            'During the End Phase of the turn that a monster was destroyed',
          ),
        ).toBe(TriggerTiming.DURING);
      });

      it('takes the earliest word otherwise', () => {
        expect(
          parseTiming('If you control no monsters, during your Main Phase'),
        ).toBe(TriggerTiming.IF);
      });

      it('reads "Each time"', () => {
        expect(parseTiming('Each time a monster is Normal Summoned')).toBe(
          TriggerTiming.EACH_TIME,
        );
      });
    });
  });

  describe('Quick Effect and activation windows', () => {
    it('flags a Quick Effect', () => {
      const c = splitClause(
        '(Quick Effect): You can discard this card; negate that effect.',
      );
      expect(c.quickEffect).toBe(true);
    });

    it('does not flag an ordinary clause', () => {
      expect(
        splitClause('Add 1 Field Spell from your Deck to your hand.')
          .quickEffect,
      ).toBe(false);
    });

    it('keeps an excluded window verbatim', () => {
      const c = splitClause(
        'If a monster is Normal Summoned (except during the Damage Step): You can draw 1 card.',
      );
      expect(c.exclusions).toEqual(['(except during the Damage Step)']);
    });
  });

  describe('legacy (pre-PSCT) sentences', () => {
    it('splits a comma-delimited condition from its resolution', () => {
      // Botanical Girl. No colon, no semicolon: before this rule the whole
      // sentence was one resolution and the passive-voice guard killed it.
      const c = splitClause(
        'When this card is sent from the field to the GY, you can add 1 Plant-Type monster with 1000 or less DEF from your Deck to your hand.',
      );
      expect(c.legacy).toBe(true);
      expect(c.trigger).toBe('When this card is sent from the field to the GY');
      expect(c.resolutions.map((r) => r.text)).toEqual([
        'you can add 1 Plant-Type monster with 1000 or less DEF from your Deck to your hand.',
      ]);
      expect(c.timing).toBe(TriggerTiming.WHEN);
    });

    it('lifts a legacy "pay X to <verb>" cost out of the resolution', () => {
      // Pandaborg. PSCT would print this as "pay 800 LP; Special Summon ...".
      const c = splitClause(
        'When this card is destroyed by battle and sent to the GY, you can pay 800 Life Points to Special Summon 1 Level 4 Psychic-Type monster from your Deck.',
      );
      expect(c.cost).toBe('pay 800 Life Points');
      expect(c.resolutions.map((r) => r.text)).toEqual([
        'Special Summon 1 Level 4 Psychic-Type monster from your Deck.',
      ]);
    });

    it('splits before a bare imperative verb, not only before "you can"', () => {
      const c = splitClause(
        'When this card is destroyed by battle, destroy all monsters on the field.',
      );
      expect(c.trigger).toBe('When this card is destroyed by battle');
      expect(c.resolutions.map((r) => r.text)).toEqual([
        'destroy all monsters on the field.',
      ]);
    });

    it('ignores commas inside the condition', () => {
      const c = splitClause(
        'During the End Phase of the turn that a B.E.S. monster, or a Big Core, is destroyed and sent to the GY, you can Special Summon 1 B.E.S. monster from your Deck.',
      );
      expect(c.trigger).toBe(
        'During the End Phase of the turn that a B.E.S. monster, or a Big Core, is destroyed and sent to the GY',
      );
    });

    it('does not fire on a sentence that is all resolution', () => {
      const c = splitClause(
        'Add 1 Level 4 or lower Warrior monster from your Deck to your hand.',
      );
      expect(c.legacy).toBe(false);
      expect(c.trigger).toBeUndefined();
    });

    it('never fires on modern text, even when it has commas', () => {
      // The guard: a colon or semicolon anywhere means PSCT, so the comma
      // before ", but you cannot activate" must not become a trigger.
      const c = splitClause(
        'If this card is sent from the field to the GY: Add 1 monster with 1500 or less ATK from your Deck to your hand, but you cannot activate cards with that name.',
      );
      expect(c.legacy).toBe(false);
      expect(c.trigger).toBe('If this card is sent from the field to the GY');
    });

    it('does not split a legacy sentence with no resolution marker', () => {
      const c = splitClause(
        'While this card is face-up on the field, its ATK is 2000.',
      );
      expect(c.legacy).toBe(false);
    });
  });
});
