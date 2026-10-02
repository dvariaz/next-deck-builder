import { parseCardEffects, resolvedSearchActions } from './card-effect-parser';
import type { ParsedCardEffects, ParserContext } from './card-effect.types';
import { FIXTURES, FIXTURE_ARCHETYPES, FIXTURE_RACES } from './fixtures';

const PARSED_AT = '2026-01-01T00:00:00.000Z';

const ctxFor = (cardName: string): ParserContext => ({
  archetypes: FIXTURE_ARCHETYPES,
  races: FIXTURE_RACES,
  cardName,
});

const parse = (fixture: { name: string; description: string }) =>
  parseCardEffects(fixture.description, ctxFor(fixture.name), PARSED_AT);

/** The search actions the graph would draw edges from. */
const searches = (parsed: ParsedCardEffects) =>
  resolvedSearchActions(parsed).map(({ action }) => action);

describe('parseCardEffects', () => {
  describe('envelope', () => {
    it('stamps the version, origin and timestamp', () => {
      const parsed = parse(FIXTURES.terraforming);
      expect(parsed).toMatchObject({
        version: 1,
        origin: 'RULES',
        parsedAt: PARSED_AT,
      });
    });

    it('handles empty text without throwing', () => {
      const parsed = parseCardEffects('', ctxFor('Nothing'), PARSED_AT);
      expect(parsed.effects).toEqual([]);
      expect(parsed.needsReview).toBe(false);
    });
  });

  describe('Reinforcement of the Army — the canonical deck search', () => {
    const parsed = parse(FIXTURES.reinforcementOfTheArmy);

    it('produces exactly one search', () => {
      expect(searches(parsed)).toHaveLength(1);
    });

    it('reads the verb, zone, destination and predicate', () => {
      expect(searches(parsed)[0]).toMatchObject({
        verb: 'ADD',
        sourceZones: [{ zone: 'DECK', owner: 'SELF' }],
        destination: 'HAND',
        target: {
          kind: 'criteria',
          predicate: { cardType: ['MONSTER'], race: ['Warrior'], levelMax: 4 },
          label: '1 Level 4 or lower Warrior monster',
        },
      });
    });

    it('is mandatory, not optional', () => {
      expect(parsed.effects[0].optional).toBe(false);
    });
  });

  describe('Terraforming', () => {
    it('reads a Field Spell search', () => {
      expect(searches(parse(FIXTURES.terraforming))[0]).toMatchObject({
        verb: 'ADD',
        target: {
          predicate: { cardType: ['SPELL'], spellTrapSubType: ['FIELD'] },
        },
      });
    });
  });

  describe('Foolish Burial', () => {
    const parsed = parse(FIXTURES.foolishBurial);

    it('structures the mill as a SEND to the GY', () => {
      expect(parsed.effects[0].actions[0]).toMatchObject({
        verb: 'SEND',
        sourceZones: [{ zone: 'DECK', owner: 'SELF' }],
        destination: 'GY',
      });
    });

    it('is not a search — nothing reaches your hand or field', () => {
      expect(searches(parsed)).toHaveLength(0);
    });
  });

  describe('Sangan — the ", but" split', () => {
    const parsed = parse(FIXTURES.sangan);

    it('keeps the search despite the trailing restriction', () => {
      // Without splitting on ", but", the negation guard would eat the whole
      // resolution and Sangan would look like it does nothing.
      expect(searches(parsed)).toHaveLength(1);
      expect(searches(parsed)[0]).toMatchObject({
        verb: 'ADD',
        sourceZones: [{ zone: 'DECK', owner: 'SELF' }],
        target: { predicate: { cardType: ['MONSTER'], atkMax: 1500 } },
      });
    });

    it('does not turn the trigger into an action', () => {
      // "If this card is sent from the field to the GY:" mentions both "sent"
      // and "GY" but is a condition.
      expect(parsed.effects[0].trigger?.text).toContain('sent from the field');
      expect(parsed.effects[0].actions).toHaveLength(1);
    });

    it('records the hard once-per-turn keyed to the card name', () => {
      expect(parsed.effects[0].restrictions.hardOncePerTurn).toEqual({
        scope: 'EFFECT',
        name: 'Sangan',
      });
    });

    it('keeps the activation lock as a display label', () => {
      expect(parsed.effects[0].restrictions.labels.join(' ')).toContain(
        'cannot activate cards',
      );
    });
  });

  describe('Monster Reborn', () => {
    const parsed = parse(FIXTURES.monsterReborn);

    it('treats the targeting clause as a cost, not an action', () => {
      expect(parsed.effects[0].actions).toHaveLength(1);
      expect(parsed.effects[0].actions[0].verb).toBe('SPECIAL_SUMMON');
    });
  });

  describe('Instant Fusion', () => {
    const parsed = parse(FIXTURES.instantFusion);

    it('reads the LP payment as a cost', () => {
      expect(parsed.effects[0].cost).toMatchObject({ payLifePoints: 1000 });
    });

    it('produces exactly one action — the drawbacks are not actions', () => {
      // ", but it cannot attack, also it is destroyed during the End Phase"
      expect(parsed.effects[0].actions).toHaveLength(1);
    });

    it('reads the Extra Deck summon with a summonType predicate', () => {
      expect(searches(parsed)[0]).toMatchObject({
        verb: 'SPECIAL_SUMMON',
        sourceZones: [{ zone: 'EXTRA_DECK', owner: 'SELF' }],
        target: {
          predicate: { summonType: ['FUSION'], levelMax: 5 },
        },
      });
    });

    it('records the activation limit', () => {
      expect(parsed.effects[0].restrictions.hardOncePerTurn).toEqual({
        scope: 'ACTIVATION',
        name: 'Instant Fusion',
      });
    });
  });

  describe('Emergency Teleport — legacy "-Type" and dual source zones', () => {
    const parsed = parse(FIXTURES.emergencyTeleport);

    it('reads both source zones', () => {
      expect(searches(parsed)[0].sourceZones).toEqual([
        { zone: 'HAND', owner: 'SELF' },
        { zone: 'DECK', owner: 'SELF' },
      ]);
    });

    it('reads "Psychic-Type" as the Psychic race', () => {
      expect(searches(parsed)[0].target).toMatchObject({
        predicate: { race: ['Psychic'], levelMax: 3 },
      });
    });

    it('records "but banish it" as a real but unresolved action', () => {
      // It IS a game action, unlike Instant Fusion's passive "it is destroyed",
      // so the IR keeps it - but with no resolvable target it draws no edge.
      const banish = parsed.effects[0].actions.find((a) => a.verb === 'BANISH');
      expect(banish).toMatchObject({ resolved: false });
      expect(searches(parsed)).toHaveLength(1);
    });
  });

  describe('One for One', () => {
    const parsed = parse(FIXTURES.oneForOne);

    it('reads the send as a cost, not a second action', () => {
      expect(parsed.effects[0].actions).toHaveLength(1);
      expect(parsed.effects[0].actions[0].verb).toBe('SPECIAL_SUMMON');
    });

    it('reads both source zones for the summon', () => {
      expect(searches(parsed)[0].sourceZones).toEqual([
        { zone: 'HAND', owner: 'SELF' },
        { zone: 'DECK', owner: 'SELF' },
      ]);
    });
  });

  describe('Sky Striker Ace - Raye', () => {
    const parsed = parse(FIXTURES.skyStrikerAceRaye);

    it('reads the Extra Monster Zone as a face-up field destination', () => {
      const summon = searches(parsed).find((a) => a.target.kind === 'criteria');
      expect(summon).toMatchObject({
        verb: 'SPECIAL_SUMMON',
        sourceZones: [{ zone: 'EXTRA_DECK', owner: 'SELF' }],
        destination: 'FIELD_FACE_UP',
      });
    });

    it('reads the quoted archetype plus noun as a family', () => {
      const summon = searches(parsed).find((a) => a.target.kind === 'criteria');
      expect(summon?.target).toMatchObject({
        predicate: { archetype: 'Sky Striker Ace', cardType: ['MONSTER'] },
      });
    });

    it('reads the Tribute as a cost', () => {
      expect(parsed.effects[0].cost).toMatchObject({ tribute: 1 });
    });

    it('reads "each effect of" as a hard once-per-turn', () => {
      expect(parsed.effects[0].restrictions.hardOncePerTurn).toEqual({
        scope: 'EFFECT',
        name: 'Sky Striker Ace - Raye',
      });
    });

    it('also finds the self-revival effect', () => {
      expect(searches(parsed).some((a) => a.target.kind === 'self')).toBe(true);
    });
  });

  describe('Elemental HERO Stratos — bullets', () => {
    const parsed = parse(FIXTURES.elementalHeroStratos);

    it('finds the search in the second bullet only', () => {
      expect(searches(parsed)).toHaveLength(1);
      expect(searches(parsed)[0]).toMatchObject({
        verb: 'ADD',
        target: { predicate: { archetype: 'HERO', cardType: ['MONSTER'] } },
      });
    });

    it('does not produce a search from the destroy bullet', () => {
      const verbs = parsed.effects.flatMap((e) => e.actions.map((a) => a.verb));
      expect(verbs).toContain('DESTROY');
    });
  });

  describe('Trickstar Light Stage — sentence-scoped soft OPT', () => {
    const parsed = parse(FIXTURES.trickstarLightStage);

    it('finds the archetype search', () => {
      expect(searches(parsed)[0]).toMatchObject({
        verb: 'ADD',
        target: { predicate: { archetype: 'Trickstar' } },
      });
    });

    it('does not apply the second sentence’s "Once per turn" to the search', () => {
      const searchEffect = parsed.effects.find((e) =>
        e.actions.some((a) => a.verb === 'ADD'),
      );
      expect(searchEffect?.restrictions.softOncePerTurn).toBeUndefined();
    });
  });

  describe('A.I. Connect — bullets inheriting a lead-in', () => {
    const parsed = parse(FIXTURES.aIConnect);

    it('finds the deck search in a bullet', () => {
      const add = searches(parsed).find((a) => a.verb === 'ADD');
      expect(add).toMatchObject({
        sourceZones: [{ zone: 'DECK', owner: 'SELF' }],
      });
    });

    it('does not invert the negated attribute', () => {
      const add = searches(parsed).find((a) => a.verb === 'ADD');
      expect(
        (add?.target as { predicate: { attribute?: string[] } }).predicate
          .attribute,
      ).toBeUndefined();
    });

    it('does not produce an action from the "also you cannot" segment', () => {
      const texts = parsed.effects.flatMap((e) =>
        e.actions.map((a) => a.sourceText),
      );
      expect(texts.some((t) => /cannot Special Summon/i.test(t))).toBe(false);
    });
  });

  // The canary. If a parser change makes Ash Blossom emit search edges, the
  // change is wrong: its bullets QUOTE the effects it negates.
  describe('Ash Blossom & Joyous Spring — the canary', () => {
    const parsed = parse(FIXTURES.ashBlossomJoyousSpring);

    it('emits NO search actions', () => {
      expect(searches(parsed)).toEqual([]);
    });

    it('emits no action at all from the quoted bullets', () => {
      const texts = parsed.effects.flatMap((e) =>
        e.actions.map((a) => a.sourceText),
      );
      expect(texts.some((t) => /Add a card from the Deck/i.test(t))).toBe(
        false,
      );
      expect(texts.some((t) => /Special Summon from the Deck/i.test(t))).toBe(
        false,
      );
    });

    it('still models the negate effect it actually has', () => {
      const verbs = parsed.effects.flatMap((e) => e.actions.map((a) => a.verb));
      expect(verbs).toContain('NEGATE');
    });
  });

  describe('Blue-Eyes White Dragon — vanilla flavour text', () => {
    const parsed = parse(FIXTURES.blueEyesWhiteDragon);

    it('produces no effects', () => {
      expect(parsed.effects).toEqual([]);
    });

    it('is not flagged for review — there is nothing to parse', () => {
      expect(parsed.needsReview).toBe(false);
    });
  });
});
