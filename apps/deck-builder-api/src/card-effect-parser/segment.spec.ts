import { preprocess } from './normalize';
import { splitBlocks, splitSentences } from './segment';

/** Blocks as produced from raw card text, the way the parser pipeline does it. */
const blocksOf = (raw: string) => splitBlocks(preprocess(raw).masked);

describe('segment', () => {
  describe('splitBlocks — plain text', () => {
    it('returns a single MAIN block for ordinary card text', () => {
      const blocks = blocksOf(
        'Add 1 Level 4 or lower Warrior monster from your Deck to your hand.',
      );
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({ index: 0, kind: 'MAIN' });
    });

    it('drops empty text', () => {
      expect(blocksOf('   ')).toEqual([]);
    });
  });

  describe('splitBlocks — pendulum headers', () => {
    // Verified against the pool: 374 cards use these headers, ZERO use a
    // dashed separator, so there is no dash rule to test.
    const pendulum =
      '[ Pendulum Effect ]\nYou can target 1 monster; destroy it.\n\n' +
      '[ Monster Effect ]\nYou take no battle damage from attacks involving this card.';

    it('splits the pendulum and monster halves into separate blocks', () => {
      const blocks = blocksOf(pendulum);
      expect(blocks.map((b) => b.kind)).toEqual(['PENDULUM', 'MONSTER']);
    });

    it('keeps each half body with its own header', () => {
      const [pend, mon] = blocksOf(pendulum);
      expect(pend.text).toBe('You can target 1 monster; destroy it.');
      expect(mon.text).toBe(
        'You take no battle damage from attacks involving this card.',
      );
    });

    it('keeps a preamble before the first header as a MAIN block', () => {
      const blocks = blocksOf('2+ monsters\n[ Pendulum Effect ]\nDraw 1 card.');
      expect(blocks.map((b) => b.kind)).toEqual(['MAIN', 'PENDULUM']);
      expect(blocks[0].text).toBe('2+ monsters');
    });
  });

  describe('splitBlocks — bullets', () => {
    // Elemental HERO Stratos, verbatim.
    const stratos =
      'When this card is Normal or Special Summoned: You can activate 1 of these effects.\n' +
      '● Destroy Spells/Traps on the field, up to the number of "HERO" monsters you control, except this card.\n' +
      '● Add 1 "HERO" monster from your Deck to your hand.';

    it('emits the lead-in plus one block per bullet', () => {
      const blocks = blocksOf(stratos);
      expect(blocks.map((b) => b.kind)).toEqual(['MAIN', 'BULLET', 'BULLET']);
    });

    it('gives each bullet only its own text', () => {
      const [, first, second] = blocksOf(stratos);
      expect(first.text).toContain('Destroy Spells/Traps');
      expect(first.text).not.toContain('Add 1');
      expect(second.text).toContain('Add 1');
      expect(second.text).not.toContain('Destroy');
    });

    it('attaches the shared lead-in to every bullet, so a stated cost is not lost', () => {
      const blocks = blocksOf(
        'You can discard 1 card, then activate 1 of these effects;\n' +
          '● Destroy 1 card on the field.\n' +
          '● Draw 1 card.',
      );
      const bullets = blocks.filter((b) => b.kind === 'BULLET');
      expect(bullets).toHaveLength(2);
      for (const bullet of bullets) {
        expect(bullet.leadIn).toContain('discard 1 card');
      }
    });

    it('handles bullets with no lead-in at all', () => {
      const blocks = blocksOf('● Draw 1 card.\n● Gain 500 LP.');
      expect(blocks.map((b) => b.kind)).toEqual(['BULLET', 'BULLET']);
      expect(blocks[0].leadIn).toBeUndefined();
    });

    it('assigns stable ascending indexes across blocks', () => {
      expect(blocksOf(stratos).map((b) => b.index)).toEqual([0, 1, 2]);
    });
  });

  describe('splitBlocks — quoted effects (the Ash Blossom idiom)', () => {
    // Ash Blossom & Joyous Spring, verbatim. Its bullets DESCRIBE effects it
    // negates; they are not effects you perform.
    const ashBlossom =
      'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card; negate that effect.\n' +
      '● Add a card from the Deck to the hand.\n' +
      '● Special Summon from the Deck.\n' +
      '● Send a card from the Deck to the GY.\n' +
      'You can only use this effect of "Ash Blossom & Joyous Spring" once per turn.';

    it('flags the bullets as quoted effects, not instructions', () => {
      const bullets = blocksOf(ashBlossom).filter((b) => b.kind === 'BULLET');
      expect(bullets).toHaveLength(3);
      expect(bullets.every((b) => b.quotedEffects)).toBe(true);
    });

    it('does not flag a normal "activate 1 of these effects" list', () => {
      const bullets = blocksOf(
        'You can activate 1 of these effects.\n● Draw 1 card.\n● Gain 500 LP.',
      ).filter((b) => b.kind === 'BULLET');
      expect(bullets.every((b) => b.quotedEffects)).toBe(false);
    });

    it('never flags the lead-in block itself', () => {
      const [leadIn] = blocksOf(ashBlossom);
      expect(leadIn.kind).toBe('MAIN');
      expect(leadIn.quotedEffects).toBe(false);
    });
  });

  describe('splitSentences', () => {
    it('splits on sentence boundaries', () => {
      expect(
        splitSentences('Draw 1 card. Then discard 1 card. Gain 500 LP.'),
      ).toEqual(['Draw 1 card.', 'Then discard 1 card.', 'Gain 500 LP.']);
    });

    it('does not split inside a masked card name containing periods', () => {
      const { masked } = preprocess(
        'Banish 1 "D.D. Crow" from your GY. Draw 1 card.',
      );
      expect(splitSentences(masked)).toHaveLength(2);
    });

    it('starts a new sentence at an opening parenthesis, e.g. "(Quick Effect):"', () => {
      const sentences = splitSentences(
        'Destroy 1 card. (Quick Effect): You can discard 1 card.',
      );
      expect(sentences).toEqual([
        'Destroy 1 card.',
        '(Quick Effect): You can discard 1 card.',
      ]);
    });

    it('does not split on a decimal or mid-sentence period without whitespace', () => {
      expect(splitSentences('Gain 1.5x ATK.')).toEqual(['Gain 1.5x ATK.']);
    });

    it('drops empty fragments', () => {
      expect(splitSentences('  ')).toEqual([]);
    });
  });
});
