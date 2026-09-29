import type { ParserContext } from './card-effect.types';
import { preprocess } from './normalize';
import {
  extractExceptNames,
  isResolvedTarget,
  parseQuantity,
  parseTarget,
  parseTargets,
} from './target';

const ctx: ParserContext = {
  archetypes: new Set([
    'HERO',
    'Elemental HERO',
    'Sky Striker Ace',
    'Trickstar',
    'Swordsoul',
    'Photon',
    'Galaxy',
  ]),
  races: new Set(['Warrior', 'Spellcaster', 'Psychic', 'Dragon']),
  cardName: 'Test Card',
};

/** Resolve a raw (unmasked) noun phrase the way the pipeline would. */
const resolve = (
  raw: string,
  cardName = ctx.cardName,
  inherited: string[] = [],
) => {
  const { masked, names } = preprocess(raw);
  return parseTarget(masked, names, { ...ctx, cardName }, inherited);
};

describe('target', () => {
  describe('parseQuantity', () => {
    it('reads an exact count', () => {
      expect(parseQuantity('1 monster')).toEqual({ min: 1, max: 1 });
    });

    it('reads "up to N" as an open lower bound', () => {
      expect(parseQuantity('up to 3 monsters')).toEqual({ min: 0, max: 3 });
    });

    it('reads "any number of" as ANY', () => {
      expect(parseQuantity('any number of monsters')).toBe('ANY');
    });

    it('falls back to ANY when no count is stated', () => {
      expect(parseQuantity('monsters you control')).toBe('ANY');
    });
  });

  describe('self', () => {
    it('resolves "this card"', () => {
      expect(resolve('this card').target).toEqual({ kind: 'self' });
    });

    it('resolves the card quoting its own name', () => {
      expect(resolve('1 "Sangan"', 'Sangan').target).toEqual({ kind: 'self' });
    });
  });

  describe('named targets', () => {
    it('resolves a single quoted card', () => {
      expect(resolve('1 "Sangan"').target).toEqual({
        kind: 'named',
        names: ['Sangan'],
      });
    });

    it('resolves a list of quoted cards', () => {
      expect(resolve('"Polymerization" or "Fusion Sage"').target).toEqual({
        kind: 'named',
        names: ['Polymerization', 'Fusion Sage'],
      });
    });

    it('does not mistake a quoted name for an archetype when no noun follows', () => {
      // "Sky Striker Ace - Raye" is a specific card even though "Sky Striker
      // Ace" is a known archetype.
      expect(resolve('1 "Sky Striker Ace - Raye"').target).toEqual({
        kind: 'named',
        names: ['Sky Striker Ace - Raye'],
      });
    });
  });

  describe('archetype targets', () => {
    it('reads a quoted archetype followed by a noun', () => {
      const { target } = resolve('1 "Sky Striker Ace" monster');
      expect(target).toMatchObject({
        kind: 'criteria',
        predicate: { archetype: 'Sky Striker Ace', cardType: ['MONSTER'] },
      });
    });

    it('layers the rest of the phrase onto the archetype predicate', () => {
      const { target } = resolve('1 Level 4 or lower "HERO" Warrior monster');
      expect(target).toMatchObject({
        kind: 'criteria',
        predicate: {
          archetype: 'HERO',
          cardType: ['MONSTER'],
          race: ['Warrior'],
          levelMax: 4,
        },
      });
    });

    it('reads the common ordering, descriptors before the quoted archetype', () => {
      const { target } = resolve('1 Level 4 or lower "HERO" monster');
      expect(target).toMatchObject({
        kind: 'criteria',
        predicate: { archetype: 'HERO', cardType: ['MONSTER'], levelMax: 4 },
      });
    });

    it('degrades an unknown archetype to a name match rather than dropping it', () => {
      const { target } = resolve('1 "Newly Printed Thing" monster');
      expect(target).toMatchObject({
        kind: 'criteria',
        predicate: { nameContains: 'Newly Printed Thing' },
      });
      expect(
        (target as { predicate: { archetype?: string } }).predicate.archetype,
      ).toBeUndefined();
    });

    it('matches an unquoted archetype, longest first', () => {
      const { target } = resolve('1 Elemental HERO monster');
      expect(target).toMatchObject({
        kind: 'criteria',
        predicate: { archetype: 'Elemental HERO' },
      });
    });

    it('does not read a monster Type as a bare archetype', () => {
      // The pool contains a literal archetype named "Warrior". Matching it
      // bare turns Reinforcement of the Army's 600-card search into a
      // one-archetype search.
      const withWarriorArchetype = {
        ...ctx,
        archetypes: new Set([...ctx.archetypes, 'Warrior']),
      };
      const { masked, names } = preprocess(
        '1 Level 4 or lower Warrior monster',
      );
      const { target } = parseTarget(masked, names, withWarriorArchetype);
      expect(target).toMatchObject({
        predicate: { race: ['Warrior'], cardType: ['MONSTER'], levelMax: 4 },
      });
      expect(
        (target as { predicate: { archetype?: string } }).predicate.archetype,
      ).toBeUndefined();
    });

    it('does not read a summon class as a bare archetype', () => {
      const withFusionArchetype = {
        ...ctx,
        archetypes: new Set([...ctx.archetypes, 'Fusion']),
      };
      const { masked, names } = preprocess('1 Level 5 or lower Fusion Monster');
      const { target } = parseTarget(masked, names, withFusionArchetype);
      expect(
        (target as { predicate: { archetype?: string } }).predicate.archetype,
      ).toBeUndefined();
    });

    it('keeps Konami’s verbatim wording as the label', () => {
      const { target } = resolve('1 "Sky Striker Ace" monster');
      expect(target).toMatchObject({ label: '1 Sky Striker Ace monster' });
    });
  });

  describe('criteria targets', () => {
    it('resolves a described target', () => {
      const { target } = resolve('1 Level 4 or lower Warrior monster');
      expect(target).toEqual({
        kind: 'criteria',
        predicate: { cardType: ['MONSTER'], race: ['Warrior'], levelMax: 4 },
        label: '1 Level 4 or lower Warrior monster',
      });
    });
  });

  describe('unresolved targets — the fail-safe guard', () => {
    it.each(['1 card', 'a card', 'cards', '1 of them'])(
      'refuses to resolve "%s"',
      (np) => {
        const { target } = resolve(np);
        expect(target.kind).toBe('unresolved');
      },
    );

    it('reports an unresolved target as not resolved', () => {
      expect(isResolvedTarget(resolve('a card').target)).toBe(false);
    });

    it('reports a real criteria target as resolved', () => {
      expect(isResolvedTarget(resolve('1 Warrior monster').target)).toBe(true);
    });
  });

  describe('except clauses', () => {
    it('extracts names from an except clause inside the phrase', () => {
      const { exceptNames, target } = resolve(
        '1 "Sky Striker Ace" monster, except "Sky Striker Ace - Raye"',
      );
      expect(exceptNames).toEqual(['Sky Striker Ace - Raye']);
      expect(target).toMatchObject({
        predicate: { excludeNames: ['Sky Striker Ace - Raye'] },
      });
    });

    it('accepts an exclusion the caller found outside the phrase', () => {
      // Real text puts it after the destination:
      // "add 1 Level 1 FIRE monster from your Deck to your hand, except "X""
      const { target, exceptNames } = resolve(
        '1 Level 1 FIRE monster',
        ctx.cardName,
        ['Snake-Eyes Ash'],
      );
      expect(exceptNames).toEqual(['Snake-Eyes Ash']);
      expect(target).toMatchObject({
        predicate: { excludeNames: ['Snake-Eyes Ash'] },
      });
    });

    it('does not add excludeNames when there is no exclusion', () => {
      const { target } = resolve('1 Warrior monster');
      expect(target).toMatchObject({ kind: 'criteria' });
      expect(
        (target as { predicate: { excludeNames?: string[] } }).predicate
          .excludeNames,
      ).toBeUndefined();
    });
  });

  describe('extractExceptNames', () => {
    it('pulls names out of a full resolution segment', () => {
      const { masked, names } = preprocess(
        'add 1 Level 1 FIRE monster from your Deck to your hand, except "Snake-Eyes Ash"',
      );
      expect(extractExceptNames(masked, names)).toEqual(['Snake-Eyes Ash']);
    });

    it('handles a list of exclusions', () => {
      const { masked, names } = preprocess('..., except "A" or "B"');
      expect(extractExceptNames(masked, names)).toEqual(['A', 'B']);
    });

    it('returns nothing when there is no except clause', () => {
      const { masked, names } = preprocess('Add 1 monster to your hand.');
      expect(extractExceptNames(masked, names)).toEqual([]);
    });
  });
});

describe('parseTargets — a phrase offering a choice', () => {
  const targets = (raw: string) => {
    const { masked, names } = preprocess(raw);
    return parseTargets(masked, names, ctx);
  };

  // Incredible Ecclesia, the Virtuous. The family/name decision is made from
  // the LAST quoted token, and nothing follows "Fallen of Albaz" - so the whole
  // phrase used to read as a list of card names, making "Swordsoul" a literal
  // name no card has. Its half of the effect resolved to nothing.
  it('splits a family and a specific card into two targets', () => {
    const [family, named] = targets(
      '1 "Swordsoul" monster or 1 "Fallen of Albaz"',
    );

    expect(family.target).toMatchObject({
      kind: 'criteria',
      predicate: { archetype: 'Swordsoul' },
    });
    expect(named.target).toEqual({
      kind: 'named',
      names: ['Fallen of Albaz'],
    });
  });

  // Galaxy Expedition. Here ONE noun covers both names, so splitting alone
  // would strand "Photon" without it and swap one silent gap for another.
  it('shares a trailing noun across both halves', () => {
    const parsed = targets('1 Level 5 or higher "Photon" or "Galaxy" monster');

    expect(parsed).toHaveLength(2);
    expect(parsed[0].target).toMatchObject({
      kind: 'criteria',
      predicate: { archetype: 'Photon', levelMin: 5 },
    });
    expect(parsed[1].target).toMatchObject({
      kind: 'criteria',
      predicate: { archetype: 'Galaxy' },
    });
  });

  it('keeps a list of plain card names as ONE named target', () => {
    // The overwhelmingly common case. Splitting it would change nothing except
    // the edge ids, so it is deliberately left alone.
    expect(targets('1 "Sangan" or 1 "Witch of the Black Forest"')).toEqual([
      expect.objectContaining({
        target: {
          kind: 'named',
          names: ['Sangan', 'Witch of the Black Forest'],
        },
      }),
    ]);
  });

  it('does not split "Level 4 or lower"', () => {
    // `or` is far more often part of a range than a choice of targets.
    const parsed = targets('1 Level 4 or lower "HERO" monster');

    expect(parsed).toHaveLength(1);
    expect(parsed[0].target).toMatchObject({
      kind: 'criteria',
      predicate: { archetype: 'HERO', levelMax: 4 },
    });
  });

  it('returns a single target for an ordinary phrase', () => {
    expect(targets('1 "Sky Striker Ace" monster')).toHaveLength(1);
  });
});
