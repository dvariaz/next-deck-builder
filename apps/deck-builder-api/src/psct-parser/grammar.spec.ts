import { lex } from './lexer';
import { normalize } from './normalize';
import { parseTokens } from './grammar';
import { splitClause, splitSentences } from './structure';
import { Period } from './lexer';

/** Lex, split, and parse the resolution half of a single sentence. */
function parseResolution(text: string) {
  const { tokens } = lex(normalize(text));
  const [sentence] = splitSentences(tokens);
  const parts = splitClause(sentence);
  return parseTokens(
    parts.resolution.filter((t) => t.tokenType !== Period),
    'resolutionClause',
  );
}

function parseActivation(text: string) {
  const { tokens } = lex(normalize(text));
  const [sentence] = splitSentences(tokens);
  const parts = splitClause(sentence);
  return parseTokens(
    parts.activation.filter((t) => t.tokenType !== Period),
    'activationClause',
  );
}

describe('grammar — construction', () => {
  it('builds without ambiguity errors', () => {
    // Chevrotain's self-analysis throws on an ambiguous grammar at
    // construction time, so merely importing and parsing proves the rule set
    // is unambiguous.
    expect(() => parseResolution('draw 2 cards.')).not.toThrow();
  });
});

describe('grammar — resolutions', () => {
  it.each([
    'draw 2 cards.',
    'destroy it.',
    'Special Summon 1 monster from your hand.',
    'add 1 monster from your Deck to your hand.',
    'destroy 1 card on the field.',
    'end the Battle Phase.',
    'inflict 200 damage to your opponent.',
  ])('parses %s without errors', (text) => {
    const { cst, errors } = parseResolution(text);

    expect(errors).toEqual([]);
    expect(cst).not.toBeNull();
  });

  it.each([
    [
      'then',
      'Special Summon 1 monster from your hand, then end the Battle Phase.',
    ],
    ['also', 'Return 1 Spell/Trap on the field to the hand, also draw 1 card.'],
    [
      'and if you do',
      'Take 1000 damage, and if you do, destroy 1 card on the field.',
    ],
    ['and', 'Draw 2 cards and discard 1 card.'],
  ])('parses a two-part resolution joined by "%s"', (_label, text) => {
    const { cst, errors } = parseResolution(text);

    expect(errors).toEqual([]);
    // One leading group plus one tail group.
    const seq = cst!.children.actionSequence[0] as any;
    expect(seq.children.actionGroup).toHaveLength(1);
    expect(seq.children.tail).toHaveLength(1);
  });

  it('keeps a disjunction inside one noun phrase', () => {
    // "or" must not split the action: a fragment starting at "Deck" would not
    // parse at all.
    const { cst, errors } = parseResolution(
      'add 1 monster from your hand or Deck to your hand.',
    );

    expect(errors).toEqual([]);
    const seq = cst!.children.actionSequence[0] as any;
    expect(seq.children.tail).toBeUndefined();
  });

  it('parses a modifier clause with an explicit subject', () => {
    const { cst, errors } = parseResolution(
      'All "Qli" monsters you control gain 300 ATK.',
    );

    expect(errors).toEqual([]);
    const group = (cst!.children.actionSequence[0] as any).children
      .actionGroup[0];
    expect(group.children.modifierClause).toHaveLength(1);
  });

  it('parses a modifier clause with an implicit subject', () => {
    const { cst, errors } = parseResolution('cannot be destroyed by battle.');

    expect(errors).toEqual([]);
    const group = (cst!.children.actionSequence[0] as any).children
      .actionGroup[0];
    expect(group.children.modifierClause).toHaveLength(1);
  });
});

describe('grammar — activations', () => {
  it('parses an explicit target declaration', () => {
    const { cst, errors } = parseActivation(
      'Target 1 face-up monster your opponent controls; destroy that target.',
    );

    expect(errors).toEqual([]);
    const item = (cst!.children.activationItem[0] as any).children;
    expect(item.targetClause).toHaveLength(1);
  });

  it('parses a cost in the activation half', () => {
    const { cst, errors } = parseActivation(
      'Once per turn: You can discard 1 card; draw 2 cards.',
    );

    expect(errors).toEqual([]);
    const item = (cst!.children.activationItem[0] as any).children;
    expect(item.actionClause).toHaveLength(1);
  });
});

describe('grammar — failure is reported, not hidden', () => {
  it('returns errors rather than throwing on text it cannot parse', () => {
    // A bare preposition cannot start any clause.
    const { errors } = parseResolution('of the from to.');

    expect(errors.length).toBeGreaterThan(0);
  });

  it('does not leak errors from one parse into the next', () => {
    parseResolution('of the from to.');
    const { errors } = parseResolution('draw 2 cards.');

    expect(errors).toEqual([]);
  });
});
