import { parseCardEffects, resolvedSearchActions } from './card-effect-parser';
import {
  PARSER_VERSION,
  type ParsedCardEffects,
  type ParserContext,
} from './card-effect.types';
import type { CardType } from '../../generated/prisma/enums';
import {
  FIXTURES,
  FIXTURE_ARCHETYPES,
  FIXTURE_RACES,
  type CardFixture,
} from './fixtures';

const PARSED_AT = '2026-01-01T00:00:00.000Z';

/**
 * A ParserContext built the way production builds one. Takes the whole fixture
 * rather than just a name, because the card's type decides how its effects are
 * classified — see CardFixture.cardType.
 */
const ctxFor = (
  fixture: string | CardFixture,
  cardType: CardType = 'MONSTER',
): ParserContext =>
  typeof fixture === 'string'
    ? {
        archetypes: FIXTURE_ARCHETYPES,
        races: FIXTURE_RACES,
        cardName: fixture,
        cardType,
      }
    : {
        archetypes: FIXTURE_ARCHETYPES,
        races: FIXTURE_RACES,
        cardName: fixture.name,
        cardType: fixture.cardType,
        ...(fixture.spellTrapSubType
          ? { spellTrapSubType: fixture.spellTrapSubType }
          : {}),
      };

const parse = (fixture: CardFixture) =>
  parseCardEffects(fixture.description, ctxFor(fixture), PARSED_AT);

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
      // Found by its action, not by index: the card's first sentence is a
      // continuous ATK gain, which is now recorded as an effect of its own.
      const effect = parse(FIXTURES.alchemicMagician).effects.find((e) =>
        e.actions.some((a) => a.verb === 'SET'),
      );
      expect(effect?.cost).toMatchObject({ detach: 1 });
    });

    it('records the continuous ATK gain as its own effect', () => {
      const parsed = parse(FIXTURES.alchemicMagician);
      const continuous = parsed.effects.find(
        (e) => e.effectType === 'CONTINUOUS',
      );
      expect(continuous?.modifiers).toMatchObject([
        {
          kind: 'STAT',
          stat: 'ATK',
          mode: 'GAIN',
          amount: 'VARIABLE',
          target: { kind: 'self' },
        },
      ]);
      expect(continuous?.actions).toEqual([]);
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
      // "Must FIRST be" — semi-Nomi, so a GY revival of it is legal once it
      // has been Fusion Summoned properly.
      expect(conditions).toMatchObject([{ kind: 'SEMI_NOMI' }]);
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
      // Both halves now produce effects — the Pendulum half is a summon lock
      // and an ATK buff, which are continuous rather than actions — so the
      // point of this case is that each is attributed to the right block.
      const parsed = parse(FIXTURES.qliphortCarrier);
      const kinds = new Set(parsed.effects.map((e) => e.blockKind));
      expect(kinds).toEqual(new Set(['PENDULUM', 'MONSTER']));

      const pendulum = parsed.effects.filter((e) => e.blockKind === 'PENDULUM');
      expect(pendulum.flatMap((e) => e.modifiers.map((m) => m.kind))).toContain(
        'SUMMON_LOCK',
      );
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
        'A monster is Special Summoned by Add.',
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

  describe('startsChain — the colon/semicolon chain clue', () => {
    it('marks a colon effect as chainable', () => {
      // Sangan: "If this card is sent from the field to the GY: Add 1 ...".
      expect(parse(FIXTURES.sangan).effects[0].startsChain).toBe(true);
    });

    it('marks a semicolon effect as chainable', () => {
      // Monster Reborn: "Target 1 monster in either GY; Special Summon it."
      expect(parse(FIXTURES.monsterReborn).effects[0].startsChain).toBe(true);
    });

    it('marks modern text with neither punctuation as not chainable', () => {
      // Divine Wrath cannot negate one of these, because there is nothing to
      // chain to. Asserted on a sentence that DOES yield an action, because a
      // sentence yielding none is not recorded at all — see the known gap in
      // README.md ("What it deliberately does not do").
      const parsed = parseCardEffects(
        'Negate the effects of all face-up monsters your opponent controls.',
        ctxFor('Continuous'),
        PARSED_AT,
      );
      expect(parsed.effects).toHaveLength(1);
      expect(parsed.effects[0].startsChain).toBe(false);
    });

    it('records a continuous effect that performs no action', () => {
      const parsed = parseCardEffects(
        'This card gains 500 ATK for each Dragon monster you control.',
        ctxFor('Continuous'),
        PARSED_AT,
      );
      expect(parsed.effects).toHaveLength(1);
      expect(parsed.effects[0]).toMatchObject({
        effectType: 'CONTINUOUS',
        startsChain: false,
        actions: [],
      });
      expect(parsed.effects[0].trigger).toBeUndefined();
    });

    it('leaves the clue undefined on a pre-PSCT printing', () => {
      // Botanical Girl is a genuine chainable trigger effect that simply
      // predates the colon. Reporting `false` here would be a wrong fact
      // rather than a missing one.
      const effect = parse(FIXTURES.botanicalGirl).effects[0];
      expect(effect.startsChain).toBeUndefined();
      expect(effect.trigger?.timing).toBe('WHEN');
    });

    it('lets a bullet inherit the clue from its lead-in', () => {
      // A.I. Connect states "... activate 1 of these effects;" once.
      const parsed = parse(FIXTURES.aIConnect);
      const bullets = parsed.effects.filter((e) => e.blockKind === 'BULLET');
      expect(bullets.length).toBeGreaterThan(0);
      expect(bullets.every((e) => e.startsChain === true)).toBe(true);
    });

    it('never reports missesTiming for an effect that does not activate', () => {
      // No activation window means no window to miss, whatever the wording.
      const parsed = parseCardEffects(
        'When this card is face-up on the field, you can look at the top card of your Deck.',
        ctxFor('Continuous'),
        PARSED_AT,
      );
      for (const effect of parsed.effects) {
        if (effect.startsChain === false) {
          expect(effect.trigger?.missesTiming ?? false).toBe(false);
        }
      }
    });
  });

  describe('conjunctions — which actions depend on the one before', () => {
    it('marks an "and if you do" search as dependent', () => {
      // A.I. Connect's DARK bullet: "Special Summon the revealed monster, and
      // if you do, add 1 Level 4 or lower non-DARK Cyberse monster from your
      // Deck to your hand." The add only happens if the Summon succeeded, so
      // it is a weaker claim about what this card reaches than a bare search.
      const parsed = parse(FIXTURES.aIConnect);
      const add = parsed.effects
        .flatMap((effect) => effect.actions)
        .find(
          (action) =>
            action.verb === 'ADD' && action.target.kind === 'criteria',
        );

      expect(add).toMatchObject({
        conjunction: 'AND_IF_YOU_DO',
        dependsOnPrevious: true,
      });
    });

    it('leaves the first action of a resolution independent', () => {
      const action = parse(FIXTURES.reinforcementOfTheArmy).effects[0]
        .actions[0];
      expect(action).toMatchObject({
        conjunction: 'NONE',
        dependsOnPrevious: false,
      });
    });

    it('does not mark an "also" action as dependent', () => {
      // "also" leaves the two halves independent — do as much as possible.
      const parsed = parse(FIXTURES.instantFusion);
      for (const effect of parsed.effects) {
        for (const action of effect.actions) {
          if (action.conjunction === 'ALSO') {
            expect(action.dependsOnPrevious).toBe(false);
          }
        }
      }
    });
  });

  describe('effectType — classifying the effect', () => {
    it('reads a continuous effect from the ABSENCE of a trigger', () => {
      const parsed = parseCardEffects(
        'This card gains 500 ATK for each Dragon monster you control.',
        ctxFor('Continuous'),
        PARSED_AT,
      );
      expect(parsed.effects[0]).toMatchObject({
        effectType: 'CONTINUOUS',
        startsChain: false,
      });
      expect(parsed.effects[0].trigger).toBeUndefined();
    });

    it('reads a trigger effect', () => {
      expect(parse(FIXTURES.sangan).effects[0].effectType).toBe('TRIGGER');
    });

    it('reads an ignition effect from a bare phase window', () => {
      const parsed = parseCardEffects(
        'During your Main Phase: You can Special Summon 1 Warrior monster from your hand.',
        ctxFor('Ignition'),
        PARSED_AT,
      );
      expect(parsed.effects[0].effectType).toBe('IGNITION');
    });

    it('reads a Quick Effect', () => {
      expect(parse(FIXTURES.ashBlossomJoyousSpring).effects[0].effectType).toBe(
        'QUICK',
      );
    });

    it('reads a Flip effect', () => {
      expect(parse(FIXTURES.reaperOfTheCards).effects[0].effectType).toBe(
        'FLIP',
      );
    });

    describe('card type decides the chain clue', () => {
      it('treats an unpunctuated Spell as activated, not continuous', () => {
        // Terraforming. Spells and Traps start a chain when activated whatever
        // their punctuation — the colon/semicolon clue is a MONSTER-effect
        // rule, and reading this as continuous was a real bug.
        const parsed = parse(FIXTURES.terraforming);
        expect(parsed.effects[0]).toMatchObject({
          effectType: 'ACTIVATED',
          startsChain: true,
        });
      });

      it('still reads a continuous line on a card that stays on the field', () => {
        // A Continuous Spell can print a continuous state alongside its
        // activation, and that line applies without being activated.
        const parsed = parseCardEffects(
          'All "HERO" monsters you control gain 300 ATK.',
          {
            archetypes: FIXTURE_ARCHETYPES,
            races: FIXTURE_RACES,
            cardName: 'Continuous Spell',
            cardType: 'SPELL',
            spellTrapSubType: 'CONTINUOUS',
          },
          PARSED_AT,
        );
        expect(parsed.effects[0]).toMatchObject({
          effectType: 'CONTINUOUS',
          startsChain: false,
        });
      });

      it('does not read a Normal Spell line as continuous', () => {
        const parsed = parseCardEffects(
          'Inflict 1200 damage to your opponent.',
          {
            archetypes: FIXTURE_ARCHETYPES,
            races: FIXTURE_RACES,
            cardName: 'Normal Spell',
            cardType: 'SPELL',
            spellTrapSubType: 'NORMAL',
          },
          PARSED_AT,
        );
        expect(parsed.effects[0]).toMatchObject({
          effectType: 'ACTIVATED',
          startsChain: true,
        });
        expect(parsed.effects[0].actions[0]).toMatchObject({
          verb: 'INFLICT_DAMAGE',
          amount: 1200,
        });
      });
    });
  });

  describe('sentences that are not effects', () => {
    it('does not record a bare once-per-turn statement', () => {
      // This previously produced a bogus SPECIAL_SUMMON "search" out of a
      // restriction, on 8 cards.
      const parsed = parseCardEffects(
        'You can only Special Summon "Artemis, the Magistus Moon Maiden" once per turn.',
        ctxFor('Artemis, the Magistus Moon Maiden'),
        PARSED_AT,
      );
      expect(parsed.effects).toEqual([]);
      expect(parsed.needsReview).toBe(false);
    });

    it('does not record an Extra Deck materials line', () => {
      const parsed = parseCardEffects(
        '2 Level 4 monsters.',
        ctxFor('Xyz Monster'),
        PARSED_AT,
      );
      expect(parsed.effects).toEqual([]);
    });

    it('does not record a parenthetical aside', () => {
      const parsed = parseCardEffects(
        '(This card is always treated as a "Qli" card.)',
        ctxFor('Aside'),
        PARSED_AT,
      );
      expect(parsed.effects).toEqual([]);
    });

    it('still records a sentence that merely CONTAINS parentheses', () => {
      // The gate must not be greedy: a sentence that starts with "(" and ends
      // with ")" is not therefore a bare aside.
      const parsed = parseCardEffects(
        '(Quick Effect): You can pay 800 LP; Special Summon 1 Warrior monster from your GY (that card is NOT treated as a Trap).',
        ctxFor('Tiki Peace'),
        PARSED_AT,
      );
      expect(searches(parsed)).toHaveLength(1);
    });
  });

  describe('costs stated as "<cost> to <action>"', () => {
    it('lifts the cost even with no leading condition', () => {
      // "You can remove 2 A-Counters ... to Special Summon this card" — the
      // removal is what is PAID, so the Summon must survive it.
      const parsed = parseCardEffects(
        'You can remove 2 A-Counters from anywhere on the field to Special Summon this card from your hand.',
        ctxFor('Alien Overlord'),
        PARSED_AT,
      );
      const summon = parsed.effects
        .flatMap((e) => e.actions)
        .find((a) => a.verb === 'SPECIAL_SUMMON');
      expect(summon).toBeDefined();
    });

    it('lifts a Life Point cost', () => {
      const parsed = parseCardEffects(
        'Pay 1000 Life Points to Special Summon 1 Level 6 or lower Fusion Monster from your Extra Deck.',
        ctxFor('Magical Scientist'),
        PARSED_AT,
      );
      expect(searches(parsed)).toHaveLength(1);
      expect(parsed.effects[0].cost).toMatchObject({ payLifePoints: 1000 });
    });

    it('tolerates a "Once per turn," prefix before the cost', () => {
      const parsed = parseCardEffects(
        'Once per turn, you can remove 2 A-Counters from anywhere on the field to Special Summon 1 "Alien" monster from your Deck.',
        ctxFor('Code A Ancient Ruins'),
        PARSED_AT,
      );
      expect(searches(parsed)).toHaveLength(1);
    });
  });

  describe('bare "and" joining two actions', () => {
    it('splits when a real action verb follows', () => {
      // Gallis the Star Beast. Before this, INFLICT_DAMAGE won the segment and
      // the Special Summon was lost.
      const parsed = parseCardEffects(
        'Inflict damage to your opponent equal to its Level x 200 and Special Summon this card from your hand.',
        ctxFor('Gallis the Star Beast'),
        PARSED_AT,
      );
      const verbs = parsed.effects.flatMap((e) => e.actions.map((a) => a.verb));
      expect(verbs).toEqual(
        expect.arrayContaining(['INFLICT_DAMAGE', 'SPECIAL_SUMMON']),
      );
    });

    it('marks the second half as dependent, since "and" is all-or-nothing', () => {
      const parsed = parseCardEffects(
        'Inflict 500 damage to your opponent and Special Summon this card from your hand.',
        ctxFor('Test'),
        PARSED_AT,
      );
      const summon = parsed.effects
        .flatMap((e) => e.actions)
        .find((a) => a.verb === 'SPECIAL_SUMMON');
      expect(summon).toMatchObject({
        conjunction: 'AND',
        dependsOnPrevious: true,
      });
    });

    it('does NOT split a noun phrase joined by "and"', () => {
      const parsed = parseCardEffects(
        'Destroy 1 monster and 1 Spell on the field.',
        ctxFor('Test'),
        PARSED_AT,
      );
      expect(parsed.effects[0].actions).toHaveLength(1);
    });
  });

  describe('a coin or die result is a dependent conjunction', () => {
    it('splits "and if the result is heads," so the Summon survives', () => {
      const parsed = parseCardEffects(
        'You can toss a coin and if the result is heads, Special Summon this card to your field.',
        ctxFor('Couple of Aces'),
        PARSED_AT,
      );
      const verbs = parsed.effects.flatMap((e) => e.actions.map((a) => a.verb));
      expect(verbs).toEqual(
        expect.arrayContaining(['TOSS_COIN', 'SPECIAL_SUMMON']),
      );
    });

    it('splits a die roll the same way', () => {
      const parsed = parseCardEffects(
        'You can roll a six-sided die, and if you roll a 2, 3, 4, or 5, Special Summon this card.',
        ctxFor('Psychic Rover'),
        PARSED_AT,
      );
      const verbs = parsed.effects.flatMap((e) => e.actions.map((a) => a.verb));
      expect(verbs).toEqual(
        expect.arrayContaining(['ROLL_DICE', 'SPECIAL_SUMMON']),
      );
    });
  });
});
