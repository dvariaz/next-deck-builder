import type { ParserContext } from './card-effect.types';
import { isEmptyPredicate, parsePredicate } from './predicate';

/** A small fixture vocabulary, so specs never touch the DB. */
const ctx: ParserContext = {
  archetypes: new Set(['HERO', 'Elemental HERO', 'Sky Striker Ace']),
  races: new Set([
    'Warrior',
    'Beast-Warrior',
    'Winged Beast',
    'Beast',
    'Spellcaster',
    'Psychic',
    'Dragon',
    'Sea Serpent',
  ]),
  cardName: 'Test Card',
};

const parse = (np: string) => parsePredicate(np, ctx);

describe('predicate', () => {
  describe('card type', () => {
    it('reads a bare monster', () => {
      expect(parse('1 monster')).toEqual({ cardType: ['MONSTER'] });
    });

    it('reads a Spell/Trap pair as both types', () => {
      expect(parse('1 Spell/Trap Card')).toEqual({
        cardType: ['SPELL', 'TRAP'],
      });
    });

    it('reads a Field Spell as type plus subtype', () => {
      expect(parse('1 Field Spell')).toEqual({
        cardType: ['SPELL'],
        spellTrapSubType: ['FIELD'],
      });
    });

    it('reads a Quick-Play Spell', () => {
      expect(parse('1 Quick-Play Spell')).toEqual({
        cardType: ['SPELL'],
        spellTrapSubType: ['QUICK_PLAY'],
      });
    });

    it('reads a Counter Trap', () => {
      expect(parse('1 Counter Trap')).toEqual({
        cardType: ['TRAP'],
        spellTrapSubType: ['COUNTER'],
      });
    });

    it('reads a Normal Monster via monsterEffectType', () => {
      expect(parse('1 Normal Monster')).toEqual({
        cardType: ['MONSTER'],
        monsterEffectType: ['NORMAL'],
      });
    });

    it('ranks the Spell subtype rule above the bare monster fallback', () => {
      // "Normal Spell" must not be read as a Normal Monster.
      expect(parse('1 Normal Spell')).toEqual({
        cardType: ['SPELL'],
        spellTrapSubType: ['NORMAL'],
      });
    });
  });

  describe('summon class — uses summonType, never frameType', () => {
    // frameType collapses every Pendulum variant to PENDULUM, so a frameType
    // rule would silently miss 32 Extra Deck monsters.
    it.each([
      ['1 Fusion Monster', 'FUSION'],
      ['1 Synchro Monster', 'SYNCHRO'],
      ['1 Xyz Monster', 'XYZ'],
      ['1 Link Monster', 'LINK'],
      ['1 Ritual Monster', 'RITUAL'],
    ])('%s → summonType %s', (np, summonType) => {
      const p = parse(np);
      expect(p.summonType).toEqual([summonType]);
      expect(p.frameType).toBeUndefined();
    });

    it('reads a Pendulum Monster as the isPendulum flag', () => {
      expect(parse('1 Pendulum Monster')).toEqual({
        cardType: ['MONSTER'],
        isPendulum: true,
      });
    });
  });

  describe('level / rank / link', () => {
    it('reads "Level 4 or lower" as an upper bound', () => {
      expect(parse('1 Level 4 or lower monster')).toMatchObject({
        levelMax: 4,
      });
      expect(parse('1 Level 4 or lower monster').levelMin).toBeUndefined();
    });

    it('reads "Level 5 or higher" as a lower bound', () => {
      expect(parse('1 Level 5 or higher monster')).toMatchObject({
        levelMin: 5,
      });
    });

    it('reads an exact "Level 1" as both bounds', () => {
      expect(parse('1 Level 1 monster')).toMatchObject({
        levelMin: 1,
        levelMax: 1,
      });
    });

    it('does not let the exact rule fire on a bounded phrase', () => {
      // ordering hazard: LEVEL_EXACT must not match "Level 4 or lower"
      const p = parse('1 Level 4 or lower monster');
      expect(p.levelMin).toBeUndefined();
      expect(p.levelMax).toBe(4);
    });

    it('reads Rank as a level bound and pins the Xyz summon class', () => {
      expect(parse('1 Rank 4 Xyz Monster')).toMatchObject({
        levelMin: 4,
        levelMax: 4,
        summonType: ['XYZ'],
      });
    });

    it('reads "Link-2 or lower" into linkVal, not level', () => {
      const p = parse('1 Link-2 or lower Link Monster');
      expect(p.linkValMax).toBe(2);
      expect(p.levelMax).toBeUndefined();
      expect(p.summonType).toEqual(['LINK']);
    });
  });

  describe('ATK / DEF', () => {
    it('reads "with 1500 or less ATK"', () => {
      expect(parse('1 monster with 1500 or less ATK')).toMatchObject({
        atkMax: 1500,
      });
    });

    it('reads "with 2000 or more ATK"', () => {
      expect(parse('1 monster with 2000 or more ATK')).toMatchObject({
        atkMin: 2000,
      });
    });

    it('handles a thousands separator', () => {
      expect(parse('1 monster with 1,500 or less ATK')).toMatchObject({
        atkMax: 1500,
      });
    });

    it('reads a DEF bound', () => {
      expect(parse('1 monster with 2000 or less DEF')).toMatchObject({
        defMax: 2000,
      });
    });
  });

  describe('attribute', () => {
    it('reads a single attribute', () => {
      expect(parse('1 DARK monster')).toMatchObject({ attribute: ['DARK'] });
    });

    it('reads two attributes joined by "or"', () => {
      expect(parse('1 LIGHT or DARK monster')).toMatchObject({
        attribute: ['LIGHT', 'DARK'],
      });
    });

    it('skips a negated attribute rather than inverting it', () => {
      // "non-DARK" cannot be expressed by this predicate, so it must not
      // become `attribute: ['DARK']` — that would be exactly backwards.
      expect(
        parse('1 Level 4 or lower non-DARK Cyberse monster').attribute,
      ).toBeUndefined();
    });
  });

  describe('tuner', () => {
    it('reads Tuner as isTuner true', () => {
      expect(parse('1 Tuner monster')).toMatchObject({ isTuner: true });
    });

    it('reads non-Tuner as isTuner false', () => {
      // ordering hazard: NON_TUNER must be tested before TUNER
      expect(parse('1 non-Tuner monster')).toMatchObject({ isTuner: false });
    });
  });

  describe('race', () => {
    it('reads a monster Type from the injected vocabulary', () => {
      expect(parse('1 Warrior monster')).toMatchObject({ race: ['Warrior'] });
    });

    it('accepts the legacy "-Type" suffix (795 cards still print it)', () => {
      expect(parse('1 Level 3 or lower Psychic-Type monster')).toMatchObject({
        race: ['Psychic'],
        levelMax: 3,
      });
    });

    it('reads two Types joined by "or"', () => {
      expect(parse('1 Warrior or Spellcaster monster').race).toEqual([
        'Warrior',
        'Spellcaster',
      ]);
    });

    it('prefers the longest matching Type and does not also match inside it', () => {
      expect(parse('1 Winged Beast monster').race).toEqual(['Winged Beast']);
      expect(parse('1 Beast-Warrior monster').race).toEqual(['Beast-Warrior']);
    });

    it('does not apply a race to a Spell or Trap', () => {
      // Card.race doubles as the Spell/Trap subtype column, so a race must
      // never be attached to a non-monster predicate.
      expect(parse('1 Normal Spell').race).toBeUndefined();
    });
  });

  describe('isEmptyPredicate', () => {
    it('is true for a predicate that constrains nothing', () => {
      expect(isEmptyPredicate({})).toBe(true);
    });

    it('is true when only an exclusion is present', () => {
      // "except X" alone still matches the whole pool minus one card.
      expect(isEmptyPredicate({ excludeNames: ['Sangan'] })).toBe(true);
    });

    it('is true for empty arrays', () => {
      expect(isEmptyPredicate({ cardType: [], race: [] })).toBe(true);
    });

    it('is false once any field is constrained', () => {
      expect(isEmptyPredicate({ cardType: ['MONSTER'] })).toBe(false);
      expect(isEmptyPredicate({ levelMax: 4 })).toBe(false);
      expect(isEmptyPredicate({ isTuner: false })).toBe(false);
    });

    it('flags "1 card" as empty — the guard that saves Ash Blossom', () => {
      expect(isEmptyPredicate(parse('a card'))).toBe(true);
    });
  });

  describe('real target phrases', () => {
    it('Reinforcement of the Army', () => {
      expect(parse('1 Level 4 or lower Warrior monster')).toEqual({
        cardType: ['MONSTER'],
        race: ['Warrior'],
        levelMax: 4,
      });
    });

    it('Sangan', () => {
      expect(parse('1 monster with 1500 or less ATK')).toEqual({
        cardType: ['MONSTER'],
        atkMax: 1500,
      });
    });

    it('Emergency Teleport', () => {
      expect(parse('1 Level 3 or lower Psychic-Type monster')).toEqual({
        cardType: ['MONSTER'],
        race: ['Psychic'],
        levelMax: 3,
      });
    });

    it('Instant Fusion', () => {
      expect(parse('1 Level 5 or lower Fusion Monster')).toEqual({
        cardType: ['MONSTER'],
        summonType: ['FUSION'],
        levelMax: 5,
      });
    });

    it('Snake-Eyes Ash', () => {
      expect(parse('1 Level 1 FIRE monster')).toEqual({
        cardType: ['MONSTER'],
        attribute: ['FIRE'],
        levelMin: 1,
        levelMax: 1,
      });
    });
  });
});
