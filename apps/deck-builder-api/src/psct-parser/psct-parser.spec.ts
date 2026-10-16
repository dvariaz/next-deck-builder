import { parseCard } from './index';
import {
  ActionVerb,
  Conjunction,
  CostKind,
  EffectTextFormat,
  PARSER_VERSION,
  Destination,
  DiagnosticCode,
  EffectKind,
  ModifierKind,
  SelectionMode,
  TriggerTiming,
  Zone,
} from './ast';
import type {
  ActionNode,
  CostNode,
  EffectNode,
  ParsedCard,
  ParserContext,
  TargetNode,
} from './ast';

/**
 * A small stand-in for the pool's vocabulary. Real archetypes and Types only —
 * the parser validates quoted tokens against this, so a name that is NOT here
 * is treated as a specific card rather than a family.
 */
const ctx = (over: Partial<ParserContext> = {}): ParserContext => ({
  archetypes: new Set(['HERO', 'Trickstar', 'Qli', 'Elemental HERO']),
  races: new Set(['Warrior', 'Dragon', 'Spellcaster', 'Fiend']),
  cardId: '1',
  cardName: 'Test Card',
  cardType: 'MONSTER',
  ...over,
});

/** The first action node anywhere in a resolution tree. */
function firstAction(node: EffectNode | null): ActionNode | null {
  if (!node) return null;
  if (node.kind === 'action') return node;
  if (node.kind === 'conditional') return firstAction(node.then);
  if (node.kind === 'sequence' || node.kind === 'parallel') {
    for (const child of node.children) {
      const found = firstAction(child);
      if (found) return found;
    }
  }
  return null;
}

/** Every action node in a resolution tree, in order. */
function actionsOf(node: EffectNode | null): ActionNode[] {
  if (!node) return [];
  if (node.kind === 'action') return [node];
  if (node.kind === 'modifier') return [];
  if (node.kind === 'conditional') return actionsOf(node.then);
  return node.children.flatMap(actionsOf);
}

function parseOne(text: string, over: Partial<ParserContext> = {}) {
  const card = parseCard(text, ctx(over));
  return { card, effect: card.effects[0] };
}

describe("pipeline — the guide's worked examples", () => {
  it('Once per turn: You can discard 1 card; draw 2 cards.', () => {
    const { effect } = parseOne(
      'Once per turn: You can discard 1 card; draw 2 cards.',
    );

    expect(effect.condition.map((c) => c.kind)).toContain('frequency');
    expect(effect.optional).toBe(true);

    const cost = effect.activation[0] as CostNode;
    expect(cost.kind).toBe('cost');
    expect(cost.cost).toBe(CostKind.DISCARD);
    expect(cost.amount).toBe(1);

    const action = firstAction(effect.resolution)!;
    expect(action.verb).toBe(ActionVerb.DRAW);
    expect(action.amount).toBe(2);
  });

  it('When this card is sent to the Graveyard: Add 1 monster with 1500 or less ATK from your Deck to your hand.', () => {
    const { effect } = parseOne(
      'When this card is sent to the Graveyard: Add 1 monster with 1500 or less ATK from your Deck to your hand.',
    );

    expect(effect.effectKind).toBe(EffectKind.TRIGGER);
    expect(effect.condition[0].timing).toBe(TriggerTiming.WHEN);

    const action = firstAction(effect.resolution)!;
    expect(action.verb).toBe(ActionVerb.ADD);
    expect(action.destination).toBe(Destination.HAND);
    expect(action.object!.sourceZones).toEqual([
      { zone: Zone.DECK, owner: 'self' },
    ]);

    // The ATK threshold must become a queryable column, not an adjective.
    const subject = action.object!.subject;
    expect(subject.kind).toBe('criteria');
    if (subject.kind === 'criteria') {
      expect(subject.filter.atkMax).toBe(1500);
      expect(subject.filter.cardType).toEqual(['MONSTER']);
    }
  });

  it('Target 1 face-up monster your opponent controls; destroy that target.', () => {
    const { effect } = parseOne(
      'Target 1 face-up monster your opponent controls; destroy that target.',
    );

    const target = effect.activation[0] as TargetNode;
    expect(target.kind).toBe('target');
    expect(target.selection).toBe(SelectionMode.TARGET);
    expect(target.quantity).toEqual({ min: 1, max: 1 });
    if (target.subject.kind === 'criteria') {
      expect(target.subject.filter.position).toBe('face-up');
    }

    // "that target" must link back to the declared target, not be guessed at.
    const action = firstAction(effect.resolution)!;
    expect(action.verb).toBe(ActionVerb.DESTROY);
    const object = action.object!.subject;
    expect(object.kind).toBe('reference');
    if (object.kind === 'reference') {
      expect(object.reference.resolvedTo).toBe(target.id);
      expect(object.reference.confidence).toBe(1);
    }
  });

  it('Special Summon 1 monster from your hand, then end the Battle Phase.', () => {
    const { effect } = parseOne(
      'Special Summon 1 monster from your hand, then end the Battle Phase.',
    );

    expect(effect.resolution!.kind).toBe('sequence');
    if (effect.resolution!.kind === 'sequence') {
      expect(effect.resolution!.simultaneous).toBe(false);
    }

    const [summon, endPhase] = actionsOf(effect.resolution);
    expect(summon.verb).toBe(ActionVerb.SPECIAL_SUMMON);
    expect(summon.object!.sourceZones).toEqual([
      { zone: Zone.HAND, owner: 'self' },
    ]);
    expect(endPhase.verb).toBe(ActionVerb.END_BATTLE_PHASE);

    // "then" makes the second action depend on the first succeeding.
    expect(endPhase.conjunction).toBe(Conjunction.THEN);
    expect(endPhase.dependsOnPrevious).toBe(true);
  });

  it('Return 1 Spell/Trap on the field to the hand, also draw 1 card.', () => {
    const { effect } = parseOne(
      'Return 1 Spell/Trap on the field to the hand, also draw 1 card.',
    );

    expect(effect.resolution!.kind).toBe('parallel');
    if (effect.resolution!.kind === 'parallel') {
      expect(effect.resolution!.simultaneous).toBe(true);
    }

    const [ret, draw] = actionsOf(effect.resolution);
    expect(ret.verb).toBe(ActionVerb.RETURN);
    expect(draw.verb).toBe(ActionVerb.DRAW);

    // "also" is independent: the draw happens even if the return could not.
    expect(draw.conjunction).toBe(Conjunction.ALSO);
    expect(draw.dependsOnPrevious).toBe(false);
  });

  it('Take 1000 damage, and if you do, destroy 1 card on the field.', () => {
    const { effect } = parseOne(
      'Take 1000 damage, and if you do, destroy 1 card on the field.',
    );

    const actions = actionsOf(effect.resolution);
    const damage = actions.find((a) => a.verb === ActionVerb.TAKE_DAMAGE)!;
    expect(damage.amount).toBe(1000);

    // The destroy is wrapped in a conditional on the damage succeeding.
    const destroy = actions.find((a) => a.verb === ActionVerb.DESTROY)!;
    expect(destroy.conjunction).toBe(Conjunction.AND_IF_YOU_DO);
    expect(destroy.dependsOnPrevious).toBe(true);

    const hasConditional = JSON.stringify(effect.resolution).includes(
      '"conditional"',
    );
    expect(hasConditional).toBe(true);
  });

  it('Draw 2 cards and discard 1 card.', () => {
    const { effect } = parseOne('Draw 2 cards and discard 1 card.');
    const [draw, discard] = actionsOf(effect.resolution);

    expect(draw.verb).toBe(ActionVerb.DRAW);
    expect(discard.verb).toBe(ActionVerb.DISCARD);
    // Bare "and" is all-or-nothing: both halves are strictly required.
    expect(discard.conjunction).toBe(Conjunction.AND);
    expect(discard.dependsOnPrevious).toBe(true);
  });
});

describe('pipeline — rulings the IR models', () => {
  it('reports missesTiming for an optional "When" trigger', () => {
    const { effect } = parseOne(
      'When this card is sent to the GY: You can draw 1 card.',
    );

    expect(effect.condition[0].timing).toBe(TriggerTiming.WHEN);
    expect(effect.condition[0].missesTiming).toBe(true);
  });

  it('does not report missesTiming for an "If" trigger', () => {
    const { effect } = parseOne(
      'If this card is sent to the GY: You can draw 1 card.',
    );

    expect(effect.condition[0].timing).toBe(TriggerTiming.IF);
    expect(effect.condition[0].missesTiming).toBe(false);
  });

  it('does not report missesTiming for a MANDATORY "When" trigger', () => {
    // The word alone does not decide it: a mandatory effect never misses.
    const { effect } = parseOne(
      'When this card is sent to the GY: draw 1 card.',
    );

    expect(effect.optional).toBe(false);
    expect(effect.condition[0].missesTiming).toBe(false);
  });

  it.each([
    ['target 1 monster', SelectionMode.TARGET],
    ['choose 1 monster', SelectionMode.CHOOSE],
    ['select 1 monster', SelectionMode.LEGACY_SELECT],
  ])('reads "%s" as %s', (phrase, expected) => {
    const { effect } = parseOne(`${phrase} you control; destroy it.`);
    const target = effect.activation[0] as TargetNode;

    expect(target.selection).toBe(expected);
  });

  it('keeps a quoted archetype as an exact archetype match', () => {
    const { effect } = parseOne(
      'Add 1 "HERO" monster from your Deck to your hand.',
      { cardType: 'SPELL', spellTrapSubType: 'NORMAL' },
    );
    const subject = firstAction(effect.resolution)!.object!.subject;

    expect(subject.kind).toBe('criteria');
    if (subject.kind === 'criteria') {
      expect(subject.filter.archetype).toBe('HERO');
      // The verbatim phrase is preserved for display.
      expect(subject.label).toContain('"HERO"');
    }
  });

  it('treats an unknown quoted name as one specific card', () => {
    const { effect } = parseOne(
      'Special Summon 1 "Dark Magician" from your hand.',
    );
    const subject = firstAction(effect.resolution)!.object!.subject;

    expect(subject).toEqual({ kind: 'named', names: ['Dark Magician'] });
  });

  it('classifies a Spell with no punctuation as activated, not continuous', () => {
    // Terraforming: every Spell starts a Chain when played, whatever its
    // punctuation. Reading the absence of a colon as "continuous" is the
    // mistake this case exists to catch.
    const { effect } = parseOne(
      'Add 1 Field Spell from your Deck to your hand.',
      {
        cardType: 'SPELL',
        spellTrapSubType: 'NORMAL',
        cardName: 'Terraforming',
      },
    );

    expect(effect.effectKind).toBe(EffectKind.ACTIVATED);
    expect(effect.startsChain).toBe(true);
  });

  it('reports startsChain as unknown for pre-PSCT monster text', () => {
    // Botanical Girl: a genuine chainable trigger that predates the colon.
    // `false` here would be a wrong fact; `undefined` is a missing one.
    const { effect } = parseOne(
      'When this card is sent from the field to the GY, you can add 1 Plant monster from your Deck to your hand.',
      { cardName: 'Botanical Girl' },
    );

    expect(effect.effectKind).toBe(EffectKind.TRIGGER);
    expect(effect.startsChain).toBeUndefined();
    expect(effect.diagnostics.map((d) => d.code)).toContain(
      DiagnosticCode.LEGACY_TEXT,
    );
  });

  it('records a continuous stat buff as a modifier, not an action', () => {
    const { effect } = parseOne('All "Qli" monsters you control gain 300 ATK.');

    expect(effect.resolution!.kind).toBe('modifier');
    if (effect.resolution!.kind === 'modifier') {
      expect(effect.resolution.modifier).toBe(ModifierKind.STAT);
      expect(effect.resolution.stat).toBe('atk');
      expect(effect.resolution.mode).toBe('gain');
      expect(effect.resolution.amount).toBe(300);
      // The buffed family is queryable, exactly as a search's object is.
      expect(effect.resolution.object!.subject.kind).toBe('criteria');
    }
  });

  it('separates "becomes" from "gains", which is a ruling distinction', () => {
    const { effect } = parseOne('Its ATK becomes 0.');

    if (effect.resolution?.kind === 'modifier') {
      expect(effect.resolution.mode).toBe('becomes');
      expect(effect.resolution.amount).toBe(0);
    }
  });

  it('classifies a Summon condition rather than parsing it as an action', () => {
    // Full of Summon and banish verbs, but it describes no searchable action.
    const { effect } = parseOne(
      'Must be Special Summoned by banishing 3 monsters from your GY.',
    );

    expect(effect.effectKind).toBe(EffectKind.SUMMON_CONDITION);
    expect(effect.restrictions.summonConditions[0].kind).toBe('nomi');
    expect(effect.startsChain).toBe(false);
  });

  it('keeps semi-Nomi apart from Nomi — the word "first" is the difference', () => {
    const { effect } = parseOne(
      'Must first be Special Summoned by banishing 3 monsters from your GY.',
    );

    expect(effect.restrictions.summonConditions[0].kind).toBe('semi_nomi');
  });

  it('distinguishes a hard once-per-turn from a soft one', () => {
    // The hard form is always printed as its own sentence governing the
    // effect(s) above it, so it has to be folded in rather than dropped with
    // the sentence that states it.
    const hard = parseOne(
      'You can draw 1 card. You can only use this effect of "Test Card" once per turn.',
    ).card;
    const soft = parseOne('Once per turn: You can draw 1 card.').card;

    expect(hard.effects).toHaveLength(1);
    expect(hard.effects[0].restrictions.hardOncePerTurn).toEqual({
      scope: 'effect',
      name: 'Test Card',
    });

    // A soft limit is per copy, so three copies give three uses; a hard limit
    // gives one regardless. They must not collapse into each other.
    expect(soft.effects[0].restrictions.softOncePerTurn).toBe(true);
    expect(soft.effects[0].restrictions.hardOncePerTurn).toBeUndefined();
    expect(hard.effects[0].restrictions.softOncePerTurn).toBeUndefined();
  });
});

describe('pipeline — structure that protects against false positives', () => {
  it('never turns a trigger condition into an action', () => {
    // Sangan's condition contains both "sent" and "GY". If it reached the
    // action rules it would become a false "send to GY" edge.
    const { effect } = parseOne(
      'If this card is sent from the field to the GY: Add 1 monster with 1500 or less ATK from your Deck to your hand.',
      { cardName: 'Sangan' },
    );

    const verbs = actionsOf(effect.resolution).map((a) => a.verb);
    expect(verbs).toEqual([ActionVerb.ADD]);
    expect(verbs).not.toContain(ActionVerb.SEND);
  });

  it('never turns a cost into a resolution action', () => {
    // One for One's send is a COST; only the Special Summon resolves.
    const { effect } = parseOne(
      'Send 1 monster from your hand to the GY; Special Summon 1 Level 1 monster from your hand or Deck.',
      {
        cardType: 'SPELL',
        spellTrapSubType: 'NORMAL',
        cardName: 'One for One',
      },
    );

    const cost = effect.activation[0] as CostNode;
    expect(cost.cost).toBe(CostKind.SEND_TO_GY);

    const actions = actionsOf(effect.resolution);
    expect(actions).toHaveLength(1);
    expect(actions[0].verb).toBe(ActionVerb.SPECIAL_SUMMON);

    // "from your hand or Deck" is one phrase naming two zones.
    expect(actions[0].object!.sourceZones.map((z) => z.zone)).toEqual([
      Zone.HAND,
      Zone.DECK,
    ]);
  });

  it('is not confused by a colon inside a card name', () => {
    const { effect } = parseOne(
      'Add 1 "Number 39: Utopia" from your Extra Deck to your hand.',
      { cardType: 'SPELL', spellTrapSubType: 'NORMAL' },
    );

    // No colon was treated as a structural separator, so there is no condition.
    expect(effect.condition).toEqual([]);
    const subject = firstAction(effect.resolution)!.object!.subject;
    expect(subject).toEqual({ kind: 'named', names: ['Number 39: Utopia'] });
  });

  it('is not confused by periods inside a card name', () => {
    const { card } = parseOne(
      'You can add 1 "D.D. Crow" from your Deck to your hand.',
    );

    // One sentence, not three.
    expect(card.effects).toHaveLength(1);
  });

  it('splits Pendulum halves into separate effects', () => {
    const { card } = parseOne(
      '[ Pendulum Effect ] You can draw 1 card. [ Monster Effect ] Destroy 1 card on the field.',
    );

    expect(card.effects.map((e) => e.blockKind)).toEqual([
      'pendulum',
      'monster',
    ]);
  });

  it('skips a bare materials line rather than queueing it', () => {
    const { card } = parseOne('2 Level 4 monsters');

    expect(card.effects).toEqual([]);
  });

  it('does not treat quoted bullet effects as its own', () => {
    // Ash Blossom's bullets describe what it NEGATES.
    const { card } = parseOne(
      'When a card or effect is activated that includes any of these effects: You can discard this card; negate that effect.●Add a card from the Deck to the hand.●Special Summon a monster from the Deck.',
    );

    const verbs = card.effects.flatMap((e) =>
      actionsOf(e.resolution).map((a) => a.verb),
    );
    expect(verbs).not.toContain(ActionVerb.ADD);
    expect(verbs).not.toContain(ActionVerb.SPECIAL_SUMMON);
  });
});

describe('pipeline — pronoun objects and trailing conditions', () => {
  it('accepts a pronoun as the object of a preposition', () => {
    // `Reference` is excluded from the NounPart category on purpose, so a
    // prepositional phrase that consumed only a noun phrase could not match
    // "on this card" / "from this card" / "to it". That one omission was the
    // single largest source of failed clauses in the pool.
    const { effect } = parseOne('Place 1 counter on this card.');

    expect(effect.diagnostics.map((d) => d.code)).not.toContain(
      DiagnosticCode.GRAMMAR_PARSE_ERROR,
    );
    const action = firstAction(effect.resolution)!;
    expect(action.verb).toBe(ActionVerb.PLACE);
  });

  it.each([
    'Detach 1 material from this card.',
    'Return it to the hand.',
    'Banish it from your GY.',
  ])('parses "%s" without a grammar error', (text) => {
    const { effect } = parseOne(text);

    expect(effect.diagnostics.map((d) => d.code)).not.toContain(
      DiagnosticCode.GRAMMAR_PARSE_ERROR,
    );
  });

  it('peels a trailing condition off the resolution', () => {
    const { effect } = parseOne(
      'Destroy 1 card on the field if you control a Dragon monster.',
    );

    // The action survives intact...
    const action = firstAction(effect.resolution)!;
    expect(action.verb).toBe(ActionVerb.DESTROY);
    expect(effect.diagnostics.map((d) => d.code)).not.toContain(
      DiagnosticCode.GRAMMAR_PARSE_ERROR,
    );

    // ...and the condition is recorded as trailing, not leading.
    const trailing = effect.condition.find((c) => c.position === 'trailing')!;
    expect(trailing.text).toContain('if you control');
    // A trailing "if" gates APPLICATION, so it is a restriction, never a
    // trigger event.
    expect(trailing.kind).toBe('restriction');
    expect(trailing.missesTiming).toBe(false);
  });

  it('does not let a trailing condition reclassify the effect as a trigger', () => {
    // The trap: "if" in the resolution half must not make this a TRIGGER.
    const { effect } = parseOne(
      'Destroy 1 card on the field if you control a Dragon monster.',
    );

    expect(effect.effectKind).not.toBe(EffectKind.TRIGGER);
  });

  it('does not let a trailing "when" report missing the timing', () => {
    // missesTiming is a property of an ACTIVATION window. A trailing condition
    // opens no window, so it can never miss one — not even with "when" and
    // "You can" both present, which is exactly the shape that would trip a
    // naive implementation.
    const { effect } = parseOne(
      'You can draw 1 card when you control a Dragon monster.',
    );

    expect(effect.optional).toBe(true);
    expect(effect.condition.every((c) => c.missesTiming === false)).toBe(true);
  });

  it('still lets a trailing WINDOW classify an ignition effect', () => {
    // The opposite trap: hiding every trailing condition from classification
    // would turn an ordinary ignition effect into a static one, because the
    // window is the thing that makes it an ignition.
    const { effect } = parseOne(
      'You can destroy 1 card during your Main Phase.',
    );

    const trailing = effect.condition.find((c) => c.position === 'trailing')!;
    expect(trailing.kind).toBe('timing');
    expect(effect.effectKind).toBe(EffectKind.IGNITION);
  });

  it('refuses to split when an action follows the condition marker', () => {
    // Conservative by design. Splitting at this "if" would swallow the
    // "then draw 1 card" after it into a condition, silently converting a real
    // action into prose. Leaving it unsplit keeps the first action and reports
    // the rest — losing an action to tidy up a diagnostic is the wrong trade.
    const { effect } = parseOne(
      'Destroy 1 monster if you control a Dragon monster, then draw 1 card.',
    );

    // The guard still holds: no trailing condition was peeled off, because an
    // action followed the marker.
    expect(effect.condition.some((c) => c.position === 'trailing')).toBe(false);

    // And segment recovery now keeps BOTH actions. This used to retain only
    // the destroy plus a grammar error; conjunct-level isolation means the
    // "then draw 1 card" survives too, so there is nothing left to report.
    expect(actionsOf(effect.resolution).map((a) => a.verb)).toEqual([
      ActionVerb.DESTROY,
      ActionVerb.DRAW,
    ]);
  });

  it('counts an action with a RESOLVED pronoun object as resolved', () => {
    // `resolved` is computed in the visitor, before references are linked, so a
    // pronoun object was permanently marked unresolved however precisely the
    // text identified its antecedent. "destroy it" here knows exactly what it
    // destroys, and a search graph should see that edge.
    const { effect } = parseOne(
      'Target 1 Spell/Trap on the field; destroy it.',
    );
    const action = firstAction(effect.resolution)!;

    expect(action.verb).toBe(ActionVerb.DESTROY);
    expect(action.resolved).toBe(true);
    const subject = action.object!.subject;
    expect(subject.kind).toBe('reference');
    if (subject.kind === 'reference') {
      expect(subject.reference.resolvedTo).not.toBeNull();
    }
  });

  it('still counts an UNRESOLVED pronoun object as unresolved', () => {
    // The guard on the above: with no antecedent, "it" is a genuine gap and
    // must keep reporting as one.
    const { effect } = parseOne('Destroy it.');
    const action = firstAction(effect.resolution)!;

    expect(action.resolved).toBe(false);
    expect(effect.diagnostics.map((d) => d.code)).toContain(
      DiagnosticCode.UNRESOLVED_REFERENCE,
    );
  });

  it('reads a stat from a POSSESSIVE subject', () => {
    // "this card" matched inside "This card's ATK" and left a dangling "'s",
    // breaking the clause. Once it parses, the stat is in the SUBJECT rather
    // than the complement, so it has to be read from there or the clause keeps
    // an amount with no stat attached to it.
    const { effect } = parseOne("This card's ATK becomes 2400.");

    expect(effect.resolution!.kind).toBe('modifier');
    if (effect.resolution!.kind === 'modifier') {
      expect(effect.resolution.modifier).toBe(ModifierKind.STAT);
      expect(effect.resolution.stat).toBe('atk');
      expect(effect.resolution.mode).toBe('becomes');
      expect(effect.resolution.amount).toBe(2400);
      expect(effect.resolution.object!.subject).toEqual({ kind: 'self' });
    }
    expect(effect.diagnostics).toEqual([]);
  });

  it('does not invent a stat or an amount for an unmodelled property', () => {
    // "name" is not a stat the IR models. Reporting STAT with no stat, or
    // coercing the absent amount to 'variable', would both be wrong facts.
    const { effect } = parseOne('This card\'s name becomes "Umi".');

    if (effect.resolution?.kind === 'modifier') {
      expect(effect.resolution.modifier).toBe(ModifierKind.OTHER);
      expect(effect.resolution.stat).toBeUndefined();
      expect(effect.resolution.amount).toBeUndefined();
    }
  });

  it('keeps a leading condition leading', () => {
    const { effect } = parseOne(
      'When this card is sent to the GY: You can draw 1 card.',
    );

    expect(effect.condition[0].position).toBe('leading');
    expect(effect.condition[0].missesTiming).toBe(true);
  });
});

describe('pipeline — bullet lists inherit their lead-in', () => {
  const BULLETS =
    'Once per turn: You can discard 1 card, then activate 1 of these effects;' +
    '\u25CFDraw 2 cards.' +
    '\u25CFDestroy 1 monster on the field.';

  it('applies the lead-in cost to every bullet', () => {
    // The cost is stated ONCE above the list and applies to whichever bullet
    // the player picks. Without inheritance every bullet reads as free, which
    // understates the cost on ~525 cards in the pool.
    const { card } = parseOne(BULLETS);

    expect(card.effects).toHaveLength(2);
    for (const effect of card.effects) {
      const costs = effect.activation.filter(
        (node): node is CostNode => node.kind === 'cost',
      );
      expect(costs.map((c) => c.cost)).toEqual([CostKind.DISCARD]);
      expect(costs[0].amount).toBe(1);
    }
  });

  it('does not emit the pure introducer as an effect of its own', () => {
    // "You can discard 1 card, then activate 1 of these effects;" performs
    // nothing. Emitting it would be a cost with no resolution, and would
    // double-count the cost against the bullets that inherit it.
    const { card } = parseOne(BULLETS);

    expect(card.effects.map((e) => e.blockKind)).toEqual(['bullet', 'bullet']);
    expect(card.effects.every((e) => e.resolution !== null)).toBe(true);
  });

  it('does not mistake the list introducer for a cost', () => {
    const { card } = parseOne(BULLETS);
    const kinds = card.effects.flatMap((e) =>
      e.activation
        .filter((n): n is CostNode => n.kind === 'cost')
        .map((c) => c.cost),
    );

    expect(kinds).not.toContain(CostKind.OTHER);
  });

  it('inherits the lead-in condition and its activation punctuation', () => {
    // The bullet's own text carries no colon or semicolon — the punctuation is
    // above the list — so a bullet with a real cost would otherwise classify as
    // a static effect rather than an activated one.
    const { card } = parseOne(BULLETS);

    for (const effect of card.effects) {
      expect(effect.condition.map((c) => c.text)).toContain('Once per turn');
      expect(effect.effectKind).toBe(EffectKind.ACTIVATED);
      expect(effect.startsChain).toBe(true);
    }
  });

  it('still keeps a lead-in that carries a real effect of its own', () => {
    // Ash Blossom's lead-in does more than introduce: it negates.
    const { card } = parseOne(
      'When a card or effect is activated: You can discard this card; negate that effect.' +
        '\u25CFDraw 1 card.',
    );

    expect(card.effects.length).toBeGreaterThanOrEqual(2);
    expect(card.effects.some((e) => e.blockKind === 'main')).toBe(true);
  });
});

describe('pipeline — a trailing "but" rider does not destroy the resolution', () => {
  // Real errata'd Sangan. The rider is why this card produced NOTHING: fed to
  // the grammar it fails inside the action sequence's loop, which discards the
  // whole resolution and takes the primary Add with it. 948 cards carry such a
  // rider, 810 of them alongside a search verb.
  const SANGAN =
    'If this card is sent from the field to the GY: Add 1 monster with 1500 or less ATK ' +
    'from your Deck to your hand, but you cannot activate cards, or the effects of cards, ' +
    'with that name for the rest of this turn.';

  it('keeps the primary action', () => {
    const { effect } = parseOne(SANGAN, { cardName: 'Sangan' });
    const action = firstAction(effect.resolution)!;

    expect(action.verb).toBe(ActionVerb.ADD);
    expect(action.resolved).toBe(true);
    const subject = action.object!.subject;
    if (subject.kind === 'criteria') {
      expect(subject.filter.atkMax).toBe(1500);
      expect(subject.filter.cardType).toEqual(['MONSTER']);
    }
  });

  it('still captures the rider as a restriction', () => {
    const { effect } = parseOne(SANGAN, { cardName: 'Sangan' });

    expect(effect.restrictions.labels.length).toBeGreaterThan(0);
  });

  it('declares the rider rather than dropping it silently', () => {
    // The rider contains "activate", so something WAS discarded. Peeling it
    // beats losing the whole resolution, but it must be reported.
    const { effect } = parseOne(SANGAN, { cardName: 'Sangan' });

    expect(effect.diagnostics.map((d) => d.code)).toContain(
      DiagnosticCode.TEMPLATE_NOT_SUPPORTED,
    );
  });

  it('raises no rider diagnostic when the rider performs nothing', () => {
    const { effect } = parseOne('Draw 2 cards, but skip your next Draw Phase.');

    expect(firstAction(effect.resolution)!.verb).toBe(ActionVerb.DRAW);
  });
});

describe('pipeline — uncertainty is stored, not hidden', () => {
  it('buffs a family whose zone is stated before the modifier', () => {
    // "All X on the field gain N ATK" puts a prepositional phrase between the
    // subject and the modifier. The grammar originally required the modifier to
    // follow the subject directly, so every card of this very common shape
    // produced nothing at all.
    const { effect } = parseOne(
      'All "Qli" monsters on the field gain 500 ATK.',
    );

    expect(effect.resolution!.kind).toBe('modifier');
    if (effect.resolution!.kind === 'modifier') {
      expect(effect.resolution.stat).toBe('atk');
      expect(effect.resolution.amount).toBe(500);
      expect(effect.resolution.object!.subject.kind).toBe('criteria');
      expect(effect.resolution.object!.sourceZones).toEqual([
        { zone: Zone.FIELD, owner: 'self' },
      ]);
    }
    expect(effect.diagnostics).toEqual([]);
  });

  it('never drops a sentence without saying why', () => {
    // A sentence that yields no structure must still leave a diagnostic behind.
    // Returning null and discarding its diagnostics made 243 cards in the pool
    // fail with no effects AND no explanation, which is the one outcome the
    // whole diagnostics design exists to prevent.
    const { card } = parseOne(
      'By Tributing 1 Dragon monster, destroy the frobnitz.',
    );

    expect(card.effects).toHaveLength(0);
    // The contract is that SOME diagnostic survives — whichever stage failed.
    expect(card.diagnostics.length).toBeGreaterThan(0);
    expect(card.diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /GRAMMAR_PARSE_ERROR|TEMPLATE_NOT_SUPPORTED|UNKNOWN_ACTION_VERB/,
        ),
      ]),
    );
  });

  it('stays quiet about a sentence that is genuinely not an effect', () => {
    // The counterpart to the above: flavour text must NOT be reported as a gap,
    // or ~1,200 Normal monsters would flood the review queue.
    const { card } = parseOne(
      'A mysterious dragon said to slumber beneath the sea.',
    );

    expect(card.effects).toHaveLength(0);
    expect(card.diagnostics.map((d) => d.code)).not.toContain(
      DiagnosticCode.TEMPLATE_NOT_SUPPORTED,
    );
  });

  it('reports an unresolved reference instead of guessing', () => {
    // "it" with nothing before it to refer to.
    const { effect } = parseOne('Destroy it.');

    expect(effect.diagnostics.map((d) => d.code)).toContain(
      DiagnosticCode.UNRESOLVED_REFERENCE,
    );
    expect(effect.confidence).toBeLessThan(1);
  });

  it('marks an action unresolved when its object is not pinned down', () => {
    const { effect } = parseOne('Destroy it.');
    const action = firstAction(effect.resolution)!;

    expect(action.resolved).toBe(false);
  });

  it('scores a clean parse at full confidence', () => {
    const { card, effect } = parseOne(
      'Add 1 "HERO" monster from your Deck to your hand.',
      { cardType: 'SPELL', spellTrapSubType: 'NORMAL' },
    );

    expect(effect.diagnostics).toEqual([]);
    expect(effect.confidence).toBe(1);
    expect(card.confidence).toBe(1);
  });

  it('never throws on text it cannot parse', () => {
    expect(() => parseOne('Of the from to by with.')).not.toThrow();
  });

  it('produces a schema-valid parse', () => {
    const { card } = parseOne(
      'Once per turn: You can target 1 monster you control; it gains 500 ATK until the End Phase.',
    );

    expect(card.diagnostics.map((d) => d.code)).not.toContain(
      DiagnosticCode.SCHEMA_VALIDATION_ERROR,
    );
  });
});

describe('pipeline — stacked conjunctions', () => {
  // Real Goblindbergh. Konami stacks conjunctions, and the sequence rule used
  // to allow exactly one: the second had nowhere to go, the parse failed inside
  // the loop, and the ENTIRE resolution was discarded — this card lost its
  // Special Summon outright while the older regex parser resolved it fine.
  const GOBLINDBERGH =
    'When this card is Normal Summoned: You can Special Summon 1 Level 4 or ' +
    'lower monster from your hand, also, after that, change this card to ' +
    'Defense Position.';

  it('keeps both actions across "also, after that"', () => {
    const { effect } = parseOne(GOBLINDBERGH, { cardName: 'Goblindbergh' });
    const verbs = actionsOf(effect.resolution).map((a) => a.verb);

    expect(verbs).toEqual([
      ActionVerb.SPECIAL_SUMMON,
      ActionVerb.CHANGE_POSITION,
    ]);
    expect(effect.diagnostics).toEqual([]);
  });

  it('resolves the search action it used to lose entirely', () => {
    const { effect } = parseOne(GOBLINDBERGH, { cardName: 'Goblindbergh' });
    const summon = actionsOf(effect.resolution).find(
      (a) => a.verb === ActionVerb.SPECIAL_SUMMON,
    )!;

    expect(summon.resolved).toBe(true);
    if (summon.object!.subject.kind === 'criteria') {
      expect(summon.object!.subject.filter.levelMax).toBe(4);
    }
  });

  it('records the NEAREST conjunction on the action', () => {
    const { effect } = parseOne(GOBLINDBERGH, { cardName: 'Goblindbergh' });
    const last = actionsOf(effect.resolution).at(-1)!;

    expect(last.conjunction).toBe(Conjunction.AFTER_THAT);
  });

  it('takes the stricter dependency reading across a run', () => {
    // "also" alone is independent; "after that" alone is sequential. Stacked,
    // the safe claim is dependent — asserting independence would promise
    // reachability the text does not.
    const { effect } = parseOne(GOBLINDBERGH, { cardName: 'Goblindbergh' });

    expect(actionsOf(effect.resolution).at(-1)!.dependsOnPrevious).toBe(true);
  });

  it('still wraps a conditional when the run contains "and if you do"', () => {
    // Checked across the whole run, not just the nearest conjunction.
    const { effect } = parseOne(
      'Draw 1 card, and if you do, then discard 1 card.',
    );

    expect(JSON.stringify(effect.resolution)).toContain('"conditional"');
    expect(effect.diagnostics).toEqual([]);
  });

  it('has not changed single-conjunction behaviour', () => {
    const { effect } = parseOne('Destroy 1 monster, then draw 1 card.');
    const [destroy, draw] = actionsOf(effect.resolution);

    expect(destroy.conjunction).toBe(Conjunction.NONE);
    expect(draw.conjunction).toBe(Conjunction.THEN);
    expect(draw.dependsOnPrevious).toBe(true);
  });
});

describe('pipeline — segment recovery keeps what parsed', () => {
  it('keeps a good search clause when a LATER conjunct fails', () => {
    // Abyss Vagrada's shape. Parsed as one clause, the broken "also that, add
    // ..." conjunct failed inside the sequence rule and discarded the whole
    // resolution — the Special Summon was lost entirely. This was the single
    // largest cause of lost search actions in the pool.
    const { effect } = parseOne(
      'Special Summon 3 "Cubic" monsters from your GY, also that, add 1 "Cubic" card from your Deck to your hand.',
      { archetypes: new Set(['Cubic']) },
    );
    const actions = actionsOf(effect.resolution);

    expect(actions.map((a) => a.verb)).toContain(ActionVerb.SPECIAL_SUMMON);
    expect(actions[0].resolved).toBe(true);
  });

  it('keeps a search clause followed by a qualifier it cannot interpret', () => {
    // Amazoness Secret Arts: the ", using ... as Fusion Material" tail is not
    // modelled, and used to take the Fusion Summon down with it.
    const { effect } = parseOne(
      'Fusion Summon 1 "Amazoness" Fusion Monster from your Extra Deck, using monsters from your hand or field as Fusion Material.',
      {
        cardType: 'SPELL',
        spellTrapSubType: 'NORMAL',
        archetypes: new Set(['Amazoness']),
      },
    );
    const action = firstAction(effect.resolution)!;

    expect(action.verb).toBe(ActionVerb.SPECIAL_SUMMON);
    expect(action.resolved).toBe(true);
  });

  it('declares every conjunct it could not interpret', () => {
    // Recovery must never be silent: a dropped conjunct is reported, which is
    // what separates "kept what parsed" from "quietly lost the rest".
    const { effect } = parseOne(
      'Special Summon 3 "Cubic" monsters from your GY, also that, add 1 "Cubic" card from your Deck to your hand.',
      { archetypes: new Set(['Cubic']) },
    );

    expect(effect.diagnostics.map((d) => d.code)).toContain(
      DiagnosticCode.TEMPLATE_NOT_SUPPORTED,
    );
  });

  it('does not split a bare "and" that joins NOUN phrases', () => {
    // "1 X and 1 Y" is one object. Splitting it would turn a single noun phrase
    // into two broken fragments, so the split requires an action after the
    // "and".
    const { effect } = parseOne('Draw 2 cards and discard 1 card.');

    // Here an action DOES follow, so it is a real separator.
    expect(actionsOf(effect.resolution).map((a) => a.verb)).toEqual([
      ActionVerb.DRAW,
      ActionVerb.DISCARD,
    ]);
  });

  it('leaves a clean whole-clause parse untouched', () => {
    // Recovery is a fallback. A clause that parses cleanly must not be
    // re-assembled from segments, because the whole-clause parse carries
    // richer conjunction linkage.
    const { effect } = parseOne(
      'Special Summon 1 monster from your hand, then end the Battle Phase.',
    );

    expect(effect.resolution!.kind).toBe('sequence');
    expect(effect.diagnostics).toEqual([]);
  });
});

describe('pipeline — text format detection', () => {
  it('reports modern text as psct', () => {
    const { card } = parseOne(
      'Add 1 "HERO" monster from your Deck to your hand.',
      { cardType: 'SPELL', spellTrapSubType: 'NORMAL' },
    );

    expect(card.format).toBe(EffectTextFormat.PSCT);
  });

  it('reports a comma-recovered condition as legacy', () => {
    // Botanical Girl: a real trigger effect that predates the colon. This is
    // the evidence the detector keys on, not the card's age.
    const { card } = parseOne(
      'When this card is sent from the field to the GY, you can add 1 Plant monster from your Deck to your hand.',
      { cardName: 'Botanical Girl' },
    );

    expect(card.format).toBe(EffectTextFormat.LEGACY);
  });

  it('reports an un-errata\'d "select" as legacy', () => {
    // "select" never appears in PSCT; its targeting status is undetermined,
    // which is exactly the kind of text an LLM pass would be aimed at.
    const { card } = parseOne('Select 1 monster on the field. Destroy it.');

    expect(card.format).toBe(EffectTextFormat.LEGACY);
  });

  it('keeps format separate from origin and parserVersion', () => {
    // Three different questions: what the text IS, who parsed it, and with
    // which revision. Collapsing them would make "re-parse the legacy cards
    // with the LLM" unanswerable.
    const { card } = parseOne('Draw 2 cards.', {
      cardType: 'SPELL',
      spellTrapSubType: 'NORMAL',
    });

    expect(card.format).toBe(EffectTextFormat.PSCT);
    expect(card.origin).toBe('rules');
    expect(card.parserVersion).toBe(PARSER_VERSION);
  });
});

describe('pipeline — spans point at the printed text', () => {
  it('spans every node against the ORIGINAL text, curly quotes included', () => {
    const original = 'Target 1 “HERO” monster you control;  destroy it.';
    const card: ParsedCard = parseCard(original, ctx());
    const effect = card.effects[0];

    const target = effect.activation[0] as TargetNode;
    expect(original.slice(target.span.start, target.span.end)).toBe(
      target.span.text,
    );
    expect(target.span.text).toContain('“HERO”');

    const action = firstAction(effect.resolution)!;
    expect(original.slice(action.span.start, action.span.end)).toBe(
      action.span.text,
    );
  });
});
