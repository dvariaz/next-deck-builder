import { parseCardAliases, zonesInClause } from './alias';
import { EffectZone } from './card-effect.types';
import { ALIAS_FIXTURES } from './fixtures';

const aliasesOf = (key: keyof typeof ALIAS_FIXTURES) =>
  parseCardAliases(ALIAS_FIXTURES[key].description);

describe('parseCardAliases', () => {
  describe('unconditional — "is always treated as"', () => {
    it('reads a bare quoted name as one specific card', () => {
      // The case that started this: anything searching "Fallen of Albaz" must
      // reach this card, including out of the Deck.
      expect(aliasesOf('fallenOfTheWhiteDragon')).toEqual([
        {
          name: 'Fallen of Albaz',
          kind: 'NAME',
          zones: null,
          sourceText: '(This card is always treated as "Fallen of Albaz".)',
        },
      ]);
    });

    it('reads `a "X" card` as a family, not a card name', () => {
      expect(aliasesOf('toonSummonedSkull')).toEqual([
        expect.objectContaining({
          name: 'Archfiend',
          kind: 'FAMILY',
          zones: null,
        }),
      ]);
    });

    it("accepts the `this card's name is always treated as` phrasing", () => {
      expect(aliasesOf('fusionSubstitute')).toEqual([
        expect.objectContaining({ name: 'Polymerization', kind: 'NAME' }),
      ]);
    });

    it('reads both names from a two-archetype sentence', () => {
      expect(aliasesOf('raidersWing')).toEqual([
        expect.objectContaining({
          name: 'The Phantom Knights',
          kind: 'FAMILY',
        }),
        expect.objectContaining({ name: 'Raidraptor', kind: 'FAMILY' }),
      ]);
    });

    it('handles the postfix `a card "X"` form', () => {
      // "Fur Hire" is printed after the noun, not before it.
      expect(aliasesOf('fandora')).toEqual([
        expect.objectContaining({ name: 'Fur Hire', kind: 'FAMILY' }),
      ]);
    });
  });

  describe('conditional — "name becomes X while ..."', () => {
    it('scopes the alias to the zones the clause names', () => {
      expect(aliasesOf('scarredDragonArchfiend')).toEqual([
        {
          name: 'Red Dragon Archfiend',
          kind: 'NAME',
          zones: [EffectZone.FIELD, EffectZone.GY],
          sourceText:
            'This card\'s name becomes "Red Dragon Archfiend" while on the field or in the GY.',
        },
      ]);
    });

    it('does not treat a field/GY alias as always', () => {
      // The whole point of the zone list: in the Deck this card is still only
      // "Amazoness Baby Tiger", so a Deck search must not reach it.
      const [alias] = aliasesOf('amazonessBabyTiger');
      expect(alias.zones).not.toBeNull();
      expect(alias.zones).not.toContain(EffectZone.DECK);
    });

    it('maps a named zone to itself plus FIELD', () => {
      expect(aliasesOf('blazeAcceleratorReload')).toEqual([
        expect.objectContaining({
          name: 'Tri-Blaze Accelerator',
          zones: [EffectZone.ST_ZONE, EffectZone.FIELD],
        }),
      ]);
    });

    it('finds the condition past an intervening clause', () => {
      // "...becomes X and is treated as a Normal Monster while face-up on..."
      expect(aliasesOf('mokeyMokeyAdrift')).toEqual([
        expect.objectContaining({
          name: 'Mokey Mokey',
          zones: [EffectZone.FIELD, EffectZone.GY],
        }),
      ]);
    });

    it('reads the legacy "while it is on the field" phrasing', () => {
      expect(aliasesOf('dupeFrog')).toEqual([
        expect.objectContaining({
          name: 'Des Frog',
          zones: [EffectZone.FIELD],
        }),
      ]);
    });
  });

  // Both phrasings occur far more often as ordinary effect text than as an
  // alias. Every case here is real card text, and every one of them would
  // become a wrong graph edge under a looser rule.
  describe('rejections', () => {
    it.each([
      ['a stat rather than a name', 'ultimitlBishbaalkin'],
      ['a name copied from another card', 'infernoidDecatron'],
      ['a quoted name later in the same sentence', 'epsilonTheMagnetWarrior'],
      ['a temporary change with no zone condition', 'superSoldierSoul'],
      ['a rename applied to another card ("its name")', 'tikiPeace'],
    ] as const)('emits nothing for %s', (_why, fixture) => {
      expect(aliasesOf(fixture)).toEqual([]);
    });

    it('emits nothing for text with no alias at all', () => {
      expect(
        parseCardAliases(
          'Add 1 Level 4 or lower Warrior monster from your Deck to your hand.',
        ),
      ).toEqual([]);
    });

    it('emits nothing for an empty description', () => {
      expect(parseCardAliases('')).toEqual([]);
    });

    it('drops a condition it does not understand rather than assuming always', () => {
      // "while equipped with an Equip Card" is the one real `while` clause in
      // the pool that names no zone. Guessing "always" here would make the
      // card searchable everywhere.
      expect(
        parseCardAliases(
          'This card\'s name becomes "Union Rider" while equipped with an Equip Card.',
        ),
      ).toEqual([]);
    });
  });

  describe('zonesInClause', () => {
    it.each([
      ['on the field or in the GY', [EffectZone.FIELD, EffectZone.GY]],
      [
        'in the hand, Deck, GY, or on the field',
        [EffectZone.HAND, EffectZone.DECK, EffectZone.GY, EffectZone.FIELD],
      ],
      ['in the Monster Zone', [EffectZone.MONSTER_ZONE, EffectZone.FIELD]],
      ['in the Field Zone', [EffectZone.FIELD_ZONE, EffectZone.FIELD]],
    ] as const)('reads %s', (clause, expected) => {
      expect(zonesInClause(clause).sort()).toEqual([...expected].sort());
    });

    it('does not let "Field Zone" also match the bare field rule', () => {
      expect(zonesInClause('in the Field Zone')).not.toContain(
        EffectZone.MONSTER_ZONE,
      );
      expect(zonesInClause('in the Field Zone')).toHaveLength(2);
    });

    it('returns empty for a clause naming no zone', () => {
      expect(zonesInClause('equipped with an Equip Card')).toEqual([]);
    });
  });
});
