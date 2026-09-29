import { preprocess } from './normalize';
import {
  extractLabels,
  parseHardOncePerTurn,
  parseSoftOncePerTurn,
} from './restrictions';

const hardOpt = (raw: string) => {
  const { masked, names } = preprocess(raw);
  return parseHardOncePerTurn(masked, names);
};

const labels = (raw: string) => {
  const { masked, names } = preprocess(raw);
  return extractLabels([masked], names);
};

describe('restrictions', () => {
  describe('hard once-per-turn — card-scoped', () => {
    it('reads "this effect of" (1,836 cards)', () => {
      expect(
        hardOpt('You can only use this effect of "Sangan" once per turn.'),
      ).toEqual({ scope: 'EFFECT', name: 'Sangan' });
    });

    it('reads "each effect of" (1,744 cards)', () => {
      expect(
        hardOpt(
          'You can only use each effect of "Sky Striker Ace - Raye" once per turn.',
        ),
      ).toEqual({ scope: 'EFFECT', name: 'Sky Striker Ace - Raye' });
    });

    it('reads "each of the following effects of" (435 cards)', () => {
      expect(
        hardOpt(
          'You can only use each of the following effects of "Card X" once per turn.',
        ),
      ).toEqual({ scope: 'EFFECT', name: 'Card X' });
    });

    it('reads "1 of these effects of"', () => {
      expect(
        hardOpt(
          'You can only use 1 of these effects of "Card Y" once per turn.',
        ),
      ).toEqual({ scope: 'EFFECT', name: 'Card Y' });
    });

    it('reads "the previous effect of"', () => {
      expect(
        hardOpt(
          'You can only use the previous effect of "Card Z" once per turn.',
        ),
      ).toEqual({ scope: 'EFFECT', name: 'Card Z' });
    });

    it('reads an activation limit (890 cards)', () => {
      expect(
        hardOpt('You can only activate 1 "Instant Fusion" per turn.'),
      ).toEqual({
        scope: 'ACTIVATION',
        name: 'Instant Fusion',
      });
    });

    it('reads a summon limit', () => {
      expect(
        hardOpt(
          'You can only Special Summon "Blue-Eyes Alternative White Dragon"(s) once per turn.',
        ),
      ).toEqual({
        scope: 'SUMMON',
        name: 'Blue-Eyes Alternative White Dragon',
      });
    });

    it('does not mistake an archetype summon lock for a once-per-turn limit', () => {
      expect(
        hardOpt(
          'you can only Special Summon "Dogmatika" monsters for the rest of this turn.',
        ),
      ).toBeUndefined();
    });

    it('returns nothing when the card has no hard limit', () => {
      expect(
        hardOpt('Add 1 Field Spell from your Deck to your hand.'),
      ).toBeUndefined();
    });
  });

  describe('soft once-per-turn — sentence-scoped', () => {
    it('reads a bare "Once per turn"', () => {
      expect(
        parseSoftOncePerTurn('Once per turn: You can target 1 Set card.'),
      ).toBe(true);
    });

    it('does not read the hard form as soft', () => {
      expect(
        parseSoftOncePerTurn(
          'You can only use this effect of "Sangan" once per turn.',
        ),
      ).toBe(false);
    });

    it('is false for a sentence with no limit', () => {
      expect(
        parseSoftOncePerTurn('Add 1 Field Spell from your Deck to your hand.'),
      ).toBe(false);
    });

    it('scopes to the sentence, not the card', () => {
      // Trickstar Light Stage: the search sentence has no limit; only the
      // second sentence carries "Once per turn:".
      const search =
        'When this card is activated: You can add 1 "Trickstar" monster from your Deck to your hand.';
      const other =
        "Once per turn: You can target 1 Set card in your opponent's Spell & Trap Zone.";
      expect(parseSoftOncePerTurn(search)).toBe(false);
      expect(parseSoftOncePerTurn(other)).toBe(true);
    });
  });

  describe('labels', () => {
    it('captures a summon lock with its exception', () => {
      expect(
        labels(
          'you cannot Special Summon monsters for the rest of this turn, except FIRE monsters',
        ),
      ).toEqual([
        'Summon lock: you cannot Special Summon monsters for the rest of this turn, except FIRE monsters',
      ]);
    });

    it('captures an activation lock', () => {
      expect(
        labels(
          'you cannot activate cards, or the effects of cards, with that name for the rest of this turn',
        ),
      ).toEqual([
        'Activation lock: you cannot activate cards, or the effects of cards, with that name for the rest of this turn',
      ]);
    });

    it('captures a phase restriction', () => {
      expect(labels('During the Main Phase, you can draw 1 card')).toEqual([
        'Phase lock: During the Main Phase',
      ]);
    });

    it('restores card names in labels', () => {
      expect(
        labels(
          'you cannot Special Summon monsters, except "Sky Striker Ace" monsters',
        )[0],
      ).toContain('Sky Striker Ace');
    });

    it('returns nothing for unrestricted text', () => {
      expect(labels('Add 1 Field Spell from your Deck to your hand.')).toEqual(
        [],
      );
    });

    it('ignores undefined fragments', () => {
      expect(extractLabels([undefined, undefined], [])).toEqual([]);
    });
  });
});
