import { normalize } from './normalize';
import {
  hintOf,
  lex,
  Other,
  QuotedName,
  spanOfToken,
  spanOfTokens,
  tokenEnd,
} from './lexer';
import { DiagnosticCode } from './ast';

/** Lex a sentence and render it as `Kind(image)` pairs, for readable asserts. */
function shape(text: string): string {
  const { tokens } = lex(normalize(text));
  return tokens.map((t) => `${t.tokenType.name}(${t.image})`).join(' ');
}

function kinds(text: string): string[] {
  const { tokens } = lex(normalize(text));
  return tokens.map((t) => t.tokenType.name);
}

describe('lexer — protected constructs', () => {
  it('lexes a quoted card name as a single token, colon and all', () => {
    const { tokens } = lex(
      normalize('Add 1 "Number 39: Utopia" from your Deck.'),
    );
    const quoted = tokens.filter((t) => t.tokenType === QuotedName);

    expect(quoted).toHaveLength(1);
    expect(quoted[0].image).toBe('"Number 39: Utopia"');
    // The decisive property: the colon inside the name is not a Colon token,
    // so it can never be read as PSCT's structural separator.
    expect(kinds('Add 1 "Number 39: Utopia" from your Deck.')).not.toContain(
      'Colon',
    );
  });

  it('keeps periods inside a card name out of the token stream', () => {
    const text = 'You can add 1 "D.D. Crow" from your Deck.';
    const { tokens } = lex(normalize(text));

    expect(tokens.find((t) => t.tokenType === QuotedName)?.image).toBe(
      '"D.D. Crow"',
    );
    // Only the sentence-ending period is a Period token. The two inside the
    // name are not, so sentence splitting cannot break on "D.D. Crow".
    expect(kinds(text).filter((k) => k === 'Period')).toHaveLength(1);
  });

  it('lexes a parenthetical as one token without nesting greedily', () => {
    const { tokens } = lex(
      normalize(
        '(Quick Effect): Special Summon 1 monster (that card is NOT treated as a Trap).',
      ),
    );
    const parens = tokens.filter((t) => t.tokenType.name === 'Parenthetical');

    expect(parens.map((t) => t.image)).toEqual([
      '(Quick Effect)',
      '(that card is NOT treated as a Trap)',
    ]);
    // A greedy pattern would span from the first "(" to the last ")" and eat
    // the Special Summon between them.
    expect(kinds('(Quick Effect): Special Summon 1 monster (x).')).toContain(
      'Verb',
    );
  });

  it('lexes a Pendulum block header as one token', () => {
    expect(shape('[ Pendulum Effect ] You can draw 1 card.')).toContain(
      'BlockHeader([ Pendulum Effect ])',
    );
  });
});

describe('lexer — longest-phrase-first ordering', () => {
  it('matches "and if you do" before "and"', () => {
    const { tokens } = lex(
      normalize(
        'Take 1000 damage, and if you do, destroy 1 card on the field.',
      ),
    );
    const conj = tokens.find((t) => t.tokenType.name === 'Conjunction');

    expect(conj?.image).toBe('and if you do');
    expect(hintOf(conj!)).toBe('and_if_you_do');
  });

  it('matches "after that" before the condition marker "After"', () => {
    const { tokens } = lex(normalize('After that, draw 1 card.'));

    expect(tokens[0].tokenType.name).toBe('Conjunction');
    expect(hintOf(tokens[0])).toBe('after_that');
  });

  it('matches the condition marker "Each time" before the quantifier "each"', () => {
    const { tokens } = lex(
      normalize('Each time a monster is destroyed: draw 1.'),
    );

    expect(tokens[0].tokenType.name).toBe('ConditionMarker');
    expect(hintOf(tokens[0])).toBe('each_time');
  });

  it('matches the comparator "or less" before the conjunction "or"', () => {
    const { tokens } = lex(normalize('a monster with 1500 or less ATK'));
    const comparator = tokens.find((t) => t.tokenType.name === 'Comparator');

    expect(comparator?.image).toBe('or less');
    expect(hintOf(comparator!)).toBe('or_less');
  });

  it('lexes a bare "or" as a disjunction, not a clause conjunction', () => {
    // "or" joins alternatives inside one phrase ("from your hand or Deck"), it
    // never joins two actions — that is what then/also/and if you do are for.
    // As a Conjunction it would split this phrase and leave "Deck" as an
    // unparseable fragment.
    const { tokens } = lex(normalize('from your hand or Deck'));

    expect(tokens.find((t) => t.image === 'or')?.tokenType.name).toBe(
      'Disjunction',
    );
    expect(tokens.map((t) => t.tokenType.name)).not.toContain('Conjunction');
  });

  it('matches "Special Summon" as one verb, not "Summon" alone', () => {
    const { tokens } = lex(normalize('Special Summon 1 monster.'));

    expect(tokens[0].tokenType.name).toBe('Verb');
    expect(tokens[0].image).toBe('Special Summon');
    expect(hintOf(tokens[0])).toBe('special_summon');
  });
});

describe('lexer — possessives', () => {
  it('lexes "either player\'s" as one owner token', () => {
    // The bare "either player" matched inside "either player's turn" and left a
    // dangling "'s" as Other(') + Word(s), which broke the clause outright.
    const { tokens } = lex(normalize("During either player's turn: draw 1."));

    expect(tokens.find((t) => t.tokenType.name === 'Owner')?.image).toBe(
      "either player's",
    );
    expect(tokens.map((t) => t.tokenType.name)).not.toContain('Other');
  });

  it('still lexes the non-possessive form', () => {
    const { tokens } = lex(normalize('either player can activate it'));

    expect(tokens.find((t) => t.tokenType.name === 'Owner')?.image).toBe(
      'either player',
    );
  });
});

describe('lexer — word-boundary guards', () => {
  // These are the collisions that would otherwise force extra ordering
  // constraints between kinds.
  it.each([
    ['toss', 'to', 'Verb'],
    ['inflict', 'in', 'Verb'],
    ['gains', 'gain', 'Modifier'],
    ['loses', 'lose', 'Modifier'],
  ])(
    '%s does not lex as the shorter phrase "%s"',
    (word, _shorter, expectedKind) => {
      const { tokens } = lex(normalize(word));

      expect(tokens).toHaveLength(1);
      expect(tokens[0].image).toBe(word);
      expect(tokens[0].tokenType.name).toBe(expectedKind);
    },
  );

  it('does not match a keyword inside an unrelated longer word', () => {
    const { tokens } = lex(normalize('Android'));

    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenType.name).toBe('Word');
    expect(tokens[0].image).toBe('Android');
  });
});

describe('lexer — offsets and diagnostics', () => {
  it('reports offsets into the ORIGINAL text, through normalization', () => {
    // Curly quotes and a doubled space both shift offsets between the original
    // and the normalized form, so this is the case that would break a parser
    // that reported normalized offsets.
    const original = 'Target 1 “HERO” monster;  destroy it.';
    const nt = normalize(original);
    const { tokens } = lex(nt);
    const quoted = tokens.find((t) => t.tokenType === QuotedName)!;

    // In normalized space the token is the straight-quoted name...
    expect(nt.normalized.slice(quoted.startOffset, tokenEnd(quoted))).toBe(
      '"HERO"',
    );

    // ...and its span points at the ORIGINAL curly-quoted text, so a consumer
    // highlights what was actually printed.
    expect(spanOfToken(nt, quoted)).toEqual({
      start: 9,
      end: 15,
      text: '“HERO”',
    });
  });

  it('spans a run of tokens from the first through the last', () => {
    const original = 'Target 1 monster;  destroy it.';
    const nt = normalize(original);
    const { tokens } = lex(nt);
    const destroy = tokens.findIndex((t) => t.image === 'destroy');

    // The doubled space means normalized and original offsets have diverged by
    // the time this clause starts.
    expect(spanOfTokens(nt, tokens.slice(destroy, destroy + 2)).text).toBe(
      'destroy it',
    );
  });

  it('never throws on an unexpected glyph, and says so instead', () => {
    const { tokens, diagnostics } = lex(normalize('Gain 500 LP ~ somehow.'));

    expect(tokens.some((t) => t.tokenType === Other)).toBe(true);
    expect(diagnostics.map((d) => d.code)).toContain(
      DiagnosticCode.LEXER_UNKNOWN_TOKEN,
    );
  });

  it('does not complain about benign punctuation', () => {
    const { diagnostics } = lex(normalize('Send it to the Spell & Trap Zone.'));

    expect(diagnostics).toHaveLength(0);
  });
});
