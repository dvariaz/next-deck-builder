import {
  maskQuotes,
  maskedNames,
  normalizeQuoteChars,
  normalizeRest,
  preprocess,
  unmask,
  unmaskBare,
} from './normalize';

const D = '\u0001';
const q = (n: number) => `${D}Q${n}${D}`;

describe('normalize', () => {
  describe('normalizeQuoteChars', () => {
    it('converts curly double quotes to ASCII so masking can see them', () => {
      expect(normalizeQuoteChars('“Blue-Eyes”')).toBe('"Blue-Eyes"');
    });

    it('converts curly single quotes to apostrophes', () => {
      expect(normalizeQuoteChars('your opponent’s GY')).toBe(
        "your opponent's GY",
      );
    });
  });

  describe('maskQuotes', () => {
    it('replaces a quoted name with an indexed token', () => {
      const { masked, names } = maskQuotes('Add 1 "Sangan" from your Deck.');
      expect(masked).toBe(`Add 1 ${q(0)} from your Deck.`);
      expect(names).toEqual(['Sangan']);
    });

    it('indexes multiple names in order of appearance', () => {
      const { masked, names } = maskQuotes('"A" or "B", except "C".');
      expect(masked).toBe(`${q(0)} or ${q(1)}, except ${q(2)}.`);
      expect(names).toEqual(['A', 'B', 'C']);
    });

    it('masks names containing a colon, which would otherwise split PSCT clauses', () => {
      const { masked, names } = maskQuotes(
        'Special Summon 1 "Number 39: Utopia".',
      );
      expect(masked).toBe(`Special Summon 1 ${q(0)}.`);
      expect(masked).not.toContain(':');
      expect(names).toEqual(['Number 39: Utopia']);
    });

    it('masks names containing periods, which would otherwise split sentences', () => {
      const { masked } = maskQuotes('Banish 1 "D.D. Crow" from your GY.');
      expect(masked).toBe(`Banish 1 ${q(0)} from your GY.`);
    });

    it('masks names containing zone words so they are not mistaken for zones', () => {
      const { masked } = maskQuotes(
        'Add 1 "Deck Devastation Virus" to your hand.',
      );
      expect(masked).toBe(`Add 1 ${q(0)} to your hand.`);
      // the only "Deck" left is a genuine zone reference — there is none here
      expect(masked).not.toContain('Deck');
    });

    it('does not let an unbalanced quote swallow the rest of the text', () => {
      const long = `"${'x'.repeat(200)} and more text`;
      const { masked, names } = maskQuotes(long);
      expect(names).toEqual([]);
      expect(masked).toBe(long);
    });
  });

  describe('unmask', () => {
    it('round-trips through masking', () => {
      const input =
        'Add 1 "Elemental HERO Sunrise" from your Deck to your hand.';
      const { masked, names } = maskQuotes(input);
      expect(unmask(masked, names)).toBe(input);
    });

    it('unmaskBare drops the quotes, for display labels', () => {
      const { masked, names } = maskQuotes('1 "Sky Striker Ace" monster');
      expect(unmaskBare(masked, names)).toBe('1 Sky Striker Ace monster');
    });

    it('leaves an unknown token alone rather than throwing', () => {
      expect(unmask(q(7), ['only-one'])).toBe(q(7));
    });
  });

  describe('maskedNames', () => {
    it('resolves the tokens in a fragment back to names', () => {
      const { masked, names } = maskQuotes('except "A" or "B"');
      expect(maskedNames(masked, names)).toEqual(['A', 'B']);
    });

    it('returns an empty array for a fragment with no tokens', () => {
      expect(maskedNames('1 Warrior monster', ['A'])).toEqual([]);
    });
  });

  describe('normalizeRest', () => {
    it('rewrites Graveyard to GY', () => {
      expect(normalizeRest('Send it to the Graveyard.')).toBe(
        'Send it to the GY.',
      );
    });

    it('collapses newlines and runs of whitespace to single spaces', () => {
      expect(normalizeRest('one\n\n  two\t three')).toBe('one two three');
    });

    it('normalizes bullet variants to the canonical U+25CF', () => {
      expect(normalizeRest('• Destroy 1 card.')).toBe('● Destroy 1 card.');
    });

    it('normalizes dash variants to ASCII hyphen', () => {
      expect(normalizeRest('Level 4 – 8')).toBe('Level 4 - 8');
    });
  });

  describe('preprocess — stage ordering', () => {
    it('masks names BEFORE rewriting Graveyard, so names are not corrupted', () => {
      const { masked, names } = preprocess(
        'Send 1 "The Graveyard of Wandering Souls" to the Graveyard.',
      );
      // the card name kept its original spelling...
      expect(names).toEqual(['The Graveyard of Wandering Souls']);
      // ...while the genuine zone reference was rewritten
      expect(masked).toBe(`Send 1 ${q(0)} to the GY.`);
    });

    it('masks curly-quoted names, proving quote conversion runs first', () => {
      const { names } = preprocess('Add 1 “Sangan” from your Deck.');
      expect(names).toEqual(['Sangan']);
    });

    it('produces single-spaced text with bullets intact for segmentation', () => {
      const { masked } = preprocess(
        'You can activate 1 of these effects.\n● Destroy 1 card.\n● Draw 1 card.',
      );
      expect(masked).toBe(
        'You can activate 1 of these effects. ● Destroy 1 card. ● Draw 1 card.',
      );
    });
  });
});
