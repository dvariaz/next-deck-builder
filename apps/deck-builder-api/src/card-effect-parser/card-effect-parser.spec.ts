import { parseCardEffects, resolvedSearchActions } from './card-effect-parser';
import {
  PARSER_VERSION,
  type ParsedCardEffects,
  type ParserContext,
} from './card-effect.types';
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
        version: PARSER_VERSION,
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

  describe('trigger timing — missing the timing', () => {
    it('marks an optional "When" trigger as able to miss the timing', () => {
      // Botanical Girl: "When this card is sent ... you can add ...". An
      // optional When trigger activates only if its trigger was the last
      // thing to happen.
      const effect = parse(FIXTURES.botanicalGirl).effects[0];
      expect(effect.trigger).toMatchObject({
        timing: 'WHEN',
        missesTiming: true,
      });
      expect(effect.optional).toBe(true);
    });

    it('never marks an "If" trigger as able to miss the timing', () => {
      // Snake-Eye Ash: "If this card is Normal or Special Summoned: You can
      // add ...". Same optionality, different word, opposite ruling.
      const effect = parse(FIXTURES.snakeEyeAsh).effects[0];
      expect(effect.trigger).toMatchObject({
        timing: 'IF',
        missesTiming: false,
      });
      expect(effect.optional).toBe(true);
    });

    it('does not mark a MANDATORY "When" trigger', () => {
      // Pandaborg's resolution has no "you can" on the action itself, so the
      // effect is mandatory and cannot miss the timing.
      const effect = parse(FIXTURES.pandaborg).effects[0];
      expect(effect.trigger?.timing).toBe('WHEN');
      expect(effect.trigger?.missesTiming).toBe(false);
    });

    it('flags a Quick Effect', () => {
      const effect = parse(FIXTURES.ashBlossomJoyousSpring).effects[0];
      expect(effect.trigger?.quickEffect).toBe(true);
    });
  });

  describe('Pandaborg — legacy text with a legacy cost', () => {
    it('finds the search the pre-PSCT wording hides', () => {
      const parsed = parse(FIXTURES.pandaborg);
      expect(parsed.needsReview).toBe(false);
      expect(searches(parsed)).toHaveLength(1);
      expect(searches(parsed)[0]).toMatchObject({
        verb: 'SPECIAL_SUMMON',
        resolved: true,
        sourceZones: [{ zone: 'DECK', owner: 'SELF' }],
        destination: 'FIELD_FACE_UP',
        target: {
          kind: 'criteria',
          predicate: {
            cardType: ['MONSTER'],
            levelMin: 4,
            levelMax: 4,
            race: ['Psychic'],
          },
        },
      });
    });

    it('records the Life Point payment as a cost, not an action', () => {
      expect(parse(FIXTURES.pandaborg).effects[0].cost).toEqual({
        payLifePoints: 800,
      });
    });
  });

  describe('Botanical Girl — legacy text', () => {
    it('reads the condition out of the comma clause', () => {
      const parsed = parse(FIXTURES.botanicalGirl);
      expect(parsed.effects[0].trigger?.text).toBe(
        'When this card is sent from the field to the GY',
      );
      expect(searches(parsed)[0]).toMatchObject({
        verb: 'ADD',
        destination: 'HAND',
        sourceZones: [{ zone: 'DECK', owner: 'SELF' }],
        target: {
          kind: 'criteria',
          predicate: { cardType: ['MONSTER'], defMax: 1000, race: ['Plant'] },
        },
      });
    });
  });

  describe('Alchemic Magician — detach, choose, and a pronoun across segments', () => {
    it('resolves the Set through the preceding "choose" segment', () => {
      const parsed = parse(FIXTURES.alchemicMagician);
      expect(parsed.needsReview).toBe(false);
      expect(searches(parsed)).toHaveLength(1);
      expect(searches(parsed)[0]).toMatchObject({
        verb: 'SET',
        selection: 'CHOOSE',
        resolved: true,
        sourceZones: [{ zone: 'DECK', owner: 'SELF' }],
        destination: 'FIELD_FACE_DOWN',
        target: { kind: 'criteria', label: '1 Spell Card' },
      });
    });

    it('records the detach as the cost', () => {
      expect(parse(FIXTURES.alchemicMagician).effects[0].cost).toMatchObject({
        detach: 1,
      });
    });
  });

  describe('Monster Reborn — targeting stated before the semicolon', () => {
    it('resolves the pronoun and reports the selection as targeting', () => {
      expect(searches(parse(FIXTURES.monsterReborn))[0]).toMatchObject({
        verb: 'SPECIAL_SUMMON',
        selection: 'TARGET',
        resolved: true,
        sourceZones: [{ zone: 'GY', owner: 'EITHER' }],
      });
    });

    it('does not record the targeting clause as a cost', () => {
      expect(parse(FIXTURES.monsterReborn).effects[0].cost).toEqual({});
    });
  });

  describe('Gladiator Beast Heraklinos — a Summon condition is not a search', () => {
    it('never draws an edge to the monsters that pay for its own Summon', () => {
      // "Must first be Special Summoned ... by shuffling the above cards you
      // control into the Deck" names "Gladiator Beast" monsters. Reading it as
      // an action makes them look searchable, which they are not.
      const parsed = parse(FIXTURES.gladiatorBeastHeraklinos);
      expect(searches(parsed)).toEqual([]);
    });

    it('classifies the condition instead of queueing it', () => {
      const parsed = parse(FIXTURES.gladiatorBeastHeraklinos);
      expect(parsed.unparsed).toEqual([]);
      const conditions = parsed.effects.flatMap(
        (effect) => effect.restrictions.summonConditions,
      );
      expect(conditions).toMatchObject([{ kind: 'NOMI' }]);
    });

    it('reads the trigger that follows the parenthetical', () => {
      const parsed = parse(FIXTURES.gladiatorBeastHeraklinos);
      const triggered = parsed.effects.find((effect) =>
        effect.trigger?.text.startsWith('During'),
      );
      expect(triggered?.trigger?.text).toBe(
        "During either player's turn, when a Spell/Trap Card is activated",
      );
    });
  });

  describe('Qliphort Carrier — a Summon condition inside a Pendulum card', () => {
    it('classifies "without Tributing" and draws no edge from it', () => {
      const parsed = parse(FIXTURES.qliphortCarrier);
      const conditions = parsed.effects.flatMap(
        (effect) => effect.restrictions.summonConditions,
      );
      expect(conditions).toMatchObject([{ kind: 'NO_TRIBUTE' }]);
      expect(searches(parsed)).toEqual([]);
    });

    it('keeps the Pendulum and Monster halves apart', () => {
      const parsed = parse(FIXTURES.qliphortCarrier);
      expect(
        parsed.effects.every((effect) => effect.blockKind === 'MONSTER'),
      ).toBe(true);
    });
  });

  describe('Black Luster Soldier — a Ritual Monster lead-in', () => {
    it('classifies the Ritual condition rather than queueing it', () => {
      const parsed = parse(FIXTURES.blackLusterSoldierRitual);
      expect(parsed.unparsed).toEqual([]);
      expect(
        parsed.effects.flatMap((e) => e.restrictions.summonConditions),
      ).toMatchObject([{ kind: 'RITUAL' }]);
    });
  });

  describe('Reaper of the Cards — legacy verbs', () => {
    it('reads "pick up and see" as an excavate', () => {
      const parsed = parse(FIXTURES.reaperOfTheCards);
      const verbs = parsed.effects.flatMap((e) => e.actions.map((a) => a.verb));
      expect(verbs).toContain('EXCAVATE');
    });

    it('reports legacy "select" as undetermined, not as targeting', () => {
      const parsed = parse(FIXTURES.reaperOfTheCards);
      const modes = parsed.effects.flatMap((e) =>
        e.actions.map((a) => a.selection),
      );
      expect(modes).toContain('LEGACY_SELECT');
      expect(modes).not.toContain('TARGET');
    });
  });

  describe('review queue precision', () => {
    it('does not queue a sentence the parser deliberately rejected', () => {
      // Qliphort Carrier's Pendulum half is nothing but negations and locks.
      // Queueing them made the previous version's needsReview ~70% noise.
      expect(parse(FIXTURES.qliphortCarrier).unparsed).toEqual([]);
    });

    it('does not queue a search verb that only appears in a trigger', () => {
      const parsed = parse(FIXTURES.snakeEyeAsh);
      expect(parsed.unparsed).toEqual([]);
      expect(parsed.needsReview).toBe(false);
    });

    it('does not queue a Summon condition', () => {
      expect(parse(FIXTURES.labyrinthHeavyTank).unparsed).toEqual([]);
    });

    it('still flags a card that produced no effects at all', () => {
      // The card-level fallback is deliberately coarser than the per-sentence
      // queue: a card naming a search verb that yielded nothing at all is
      // worth a look. It over-flags a purely negative card like this one,
      // which is the accepted cost of not missing a real gap — the queue is
      // 299 cards out of 14,353, small enough to read.
      const parsed = parseCardEffects(
        'You cannot Special Summon monsters this turn.',
        ctxFor('Nonsense'),
        PARSED_AT,
      );
      expect(parsed.effects).toEqual([]);
      expect(parsed.unparsed).toEqual([]);
      expect(parsed.needsReview).toBe(true);
    });

    it('reports an unpinnable target as unresolved rather than queueing it', () => {
      // "Add the thing" has a verb but no describable noun phrase. The action
      // is still recorded — `resolved: false` is the per-action signal that a
      // target could not be pinned down, and it is what the graph filters on.
      const parsed = parseCardEffects(
        'Add the thing from the place to the other place.',
        ctxFor('Nonsense'),
        PARSED_AT,
      );
      expect(parsed.unparsed).toEqual([]);
      expect(parsed.effects[0].actions[0]).toMatchObject({
        verb: 'ADD',
        resolved: false,
        target: { kind: 'unresolved' },
      });
      expect(searches(parsed)).toEqual([]);
    });
  });
});
