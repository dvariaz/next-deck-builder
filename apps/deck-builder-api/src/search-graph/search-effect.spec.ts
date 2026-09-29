import { parseCardEffects } from '../card-effect-parser/card-effect-parser';
import type { ParserContext } from '../card-effect-parser/card-effect.types';
import {
  FIXTURES,
  FIXTURE_ARCHETYPES,
  FIXTURE_RACES,
} from '../card-effect-parser/fixtures';
import { excludesExtraDeck, projectSearchEffects } from './search-effect';

const project = (fixture: { name: string; description: string }) => {
  const ctx: ParserContext = {
    archetypes: FIXTURE_ARCHETYPES,
    races: FIXTURE_RACES,
    cardName: fixture.name,
  };
  return projectSearchEffects(parseCardEffects(fixture.description, ctx));
};

describe('projectSearchEffects', () => {
  describe('the ten categories, derived', () => {
    it('1. deck search — Reinforcement of the Army', () => {
      expect(project(FIXTURES.reinforcementOfTheArmy)[0].kinds).toEqual([
        'DECK_SEARCH',
      ]);
    });

    it('2+3. Special Summon from Deck AND hand — Emergency Teleport', () => {
      // "from your hand or Deck" is genuinely both categories at once, which
      // is why kinds is an array rather than a single value.
      expect(project(FIXTURES.emergencyTeleport)[0].kinds.sort()).toEqual([
        'DECK_SUMMON',
        'HAND_EXTENDER',
      ]);
    });

    it('7. Extra Deck access — Instant Fusion', () => {
      expect(project(FIXTURES.instantFusion)[0].kinds).toContain(
        'EXTRA_DECK_ACCESS',
      );
    });

    it('8. search paid for with a cost — Instant Fusion pays LP', () => {
      expect(project(FIXTURES.instantFusion)[0].kinds).toContain('WITH_COST');
    });

    it('does not tag a free search with WITH_COST', () => {
      expect(project(FIXTURES.reinforcementOfTheArmy)[0].kinds).not.toContain(
        'WITH_COST',
      );
    });
  });

  describe('filtering', () => {
    it('drops non-search verbs — Foolish Burial mills, it does not search', () => {
      expect(project(FIXTURES.foolishBurial)).toEqual([]);
    });

    it('drops unresolved actions — Ash Blossom draws no edges', () => {
      expect(project(FIXTURES.ashBlossomJoyousSpring)).toEqual([]);
    });

    it('returns nothing for a card with no effects', () => {
      expect(project(FIXTURES.blueEyesWhiteDragon)).toEqual([]);
    });

    it('handles null and empty input', () => {
      expect(projectSearchEffects(null)).toEqual([]);
      expect(projectSearchEffects(undefined)).toEqual([]);
    });
  });

  describe('display labels', () => {
    it('flattens costs into labels', () => {
      expect(project(FIXTURES.instantFusion)[0].costs).toEqual(['Pay 1000 LP']);
    });

    it('labels a hard once-per-turn by its scope', () => {
      expect(project(FIXTURES.instantFusion)[0].restrictions).toContain(
        'Hard once per turn (activation)',
      );
    });

    it('labels Sangan’s effect-scoped hard OPT', () => {
      expect(project(FIXTURES.sangan)[0].restrictions).toContain(
        'Hard once per turn',
      );
    });

    it('carries the verbatim clause for auditing', () => {
      expect(project(FIXTURES.reinforcementOfTheArmy)[0].sourceText).toBe(
        'Add 1 Level 4 or lower Warrior monster from your Deck to your hand.',
      );
    });

    it('gives every effect a stable id', () => {
      expect(project(FIXTURES.reinforcementOfTheArmy)[0].id).toBe('0.0.0');
    });
  });

  describe('targets', () => {
    it('keeps a criteria target with its verbatim label', () => {
      expect(project(FIXTURES.reinforcementOfTheArmy)[0].target).toMatchObject({
        kind: 'criteria',
        label: '1 Level 4 or lower Warrior monster',
      });
    });

    it('keeps a self target — Sky Striker Ace - Raye revives itself', () => {
      expect(
        project(FIXTURES.skyStrikerAceRaye).some(
          (e) => e.target.kind === 'self',
        ),
      ).toBe(true);
    });
  });

  describe('excludesExtraDeck', () => {
    it('is true when the only source is the Deck', () => {
      expect(excludesExtraDeck([{ zone: 'DECK', owner: 'SELF' }])).toBe(true);
    });

    it('is false when the GY is also a source — Extra Deck monsters get there plenty of ways', () => {
      expect(
        excludesExtraDeck([
          { zone: 'DECK', owner: 'SELF' },
          { zone: 'GY', owner: 'SELF' },
        ]),
      ).toBe(false);
    });

    it('is true for a hand-only search', () => {
      // An Extra Deck monster cannot be held: returning one to the hand sends
      // it to the Extra Deck instead.
      expect(excludesExtraDeck([{ zone: 'HAND', owner: 'SELF' }])).toBe(true);
    });

    it('is true for "from your hand or Deck"', () => {
      // Incredible Ecclesia, the Virtuous. Both zones are impossible for an
      // Extra Deck monster, so the Swordsoul Synchro Monsters are not targets
      // even though the search is not Deck-only.
      expect(
        excludesExtraDeck([
          { zone: 'HAND', owner: 'SELF' },
          { zone: 'DECK', owner: 'SELF' },
        ]),
      ).toBe(true);
    });

    it('is false when the GY joins a hand search', () => {
      expect(
        excludesExtraDeck([
          { zone: 'HAND', owner: 'SELF' },
          { zone: 'GY', owner: 'SELF' },
        ]),
      ).toBe(false);
    });

    it('is false for a GY-only search', () => {
      expect(excludesExtraDeck([{ zone: 'GY', owner: 'SELF' }])).toBe(false);
    });

    it('is false for a Banished-only search', () => {
      expect(excludesExtraDeck([{ zone: 'BANISHED', owner: 'SELF' }])).toBe(
        false,
      );
    });

    it('is false when the source is already the Extra Deck', () => {
      expect(excludesExtraDeck([{ zone: 'EXTRA_DECK', owner: 'SELF' }])).toBe(
        false,
      );
    });

    it('is false for no source zones', () => {
      expect(excludesExtraDeck([])).toBe(false);
    });
  });
});
