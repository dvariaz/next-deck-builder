import { isFreeCost, parseCost } from './cost';
import { preprocess } from './normalize';

const cost = (raw: string) => {
  const { masked, names } = preprocess(raw);
  return parseCost(masked, names);
};

describe('cost', () => {
  it('returns an empty cost for no text', () => {
    expect(parseCost(undefined, [])).toEqual({});
    expect(parseCost('   ', [])).toEqual({});
    expect(isFreeCost(parseCost(undefined, []))).toBe(true);
  });

  describe('counts', () => {
    it('reads a numbered discard', () => {
      expect(cost('You can discard 1 other card')).toMatchObject({
        discard: 1,
      });
    });

    it('reads "discard this card" as a count of one', () => {
      // The count group must not require trailing whitespace, or a cost at the
      // end of a clause silently degrades to ANY.
      expect(cost('You can discard this card')).toMatchObject({ discard: 1 });
    });

    it('reads "Tribute this card" as a count of one', () => {
      expect(cost('You can Tribute this card')).toMatchObject({ tribute: 1 });
    });

    it('reads an unquantified discard as ANY', () => {
      expect(cost('discard cards')).toMatchObject({ discard: 'ANY' });
    });
  });

  it('reads a life point payment', () => {
    expect(cost('Pay 1000 LP')).toMatchObject({ payLifePoints: 1000 });
  });

  it('handles a thousands separator in LP', () => {
    expect(cost('Pay 2,000 Life Points')).toMatchObject({
      payLifePoints: 2000,
    });
  });

  it('reads deck thinning paid as a cost', () => {
    expect(
      cost('Send 1 card from the top of your Deck to the GY'),
    ).toMatchObject({
      sendDeckToGy: 1,
    });
  });

  it('does not also register a banish for a deck-send cost', () => {
    const parsed = cost('banish 1 card from the top of your Deck to the GY');
    expect(parsed.sendDeckToGy).toBeUndefined();
    expect(parsed.banish).toBe(1);
  });

  it('reads a banish cost', () => {
    expect(cost('banish 2 monsters from your GY')).toMatchObject({ banish: 2 });
  });

  it('keeps an unmodelled cost verbatim rather than dropping it', () => {
    expect(cost('Reveal 1 Cyberse monster in your hand')).toEqual({
      other: ['Reveal 1 Cyberse monster in your hand'],
    });
  });

  it('restores card names in a verbatim cost', () => {
    expect(
      cost('Reveal 1 "Blue-Eyes White Dragon" in your hand').other?.[0],
    ).toContain('Blue-Eyes White Dragon');
  });

  it('records multiple costs together', () => {
    const parsed = cost('Pay 500 LP and discard 1 card');
    expect(parsed).toMatchObject({ payLifePoints: 500, discard: 1 });
  });

  describe('detach — the Xyz activation cost', () => {
    it('reads a numbered detach', () => {
      expect(
        cost('You can detach 1 Xyz Material from this card'),
      ).toMatchObject({ detach: 1 });
    });

    it('reads a detach alongside another cost', () => {
      // Alchemic Magician pays both halves in one clause. The send is from the
      // HAND, so it is not deck thinning and must not set sendDeckToGy.
      const c = cost(
        'You can detach 1 Xyz Material from this card and send 1 card from your hand to the GY',
      );
      expect(c.detach).toBe(1);
      expect(c.sendDeckToGy).toBeUndefined();
    });

    it('reads the bare "detach 2 materials" spelling', () => {
      expect(cost('Detach 2 materials')).toMatchObject({ detach: 2 });
    });

    it('does not record a detach as an unmodelled cost', () => {
      expect(
        cost('You can detach 1 Xyz Material from this card').other,
      ).toBeUndefined();
    });
  });

  describe('a targeting clause is not a cost', () => {
    it('records nothing for a bare target clause', () => {
      // Monster Reborn: "Target 1 monster in either GY; Special Summon it."
      // Targeting occupies the cost slot in PSCT but pays nothing, and the
      // noun phrase is already on the action's target.
      expect(cost('Target 1 monster in either GY')).toEqual({});
    });

    it('records nothing for "You can target ..."', () => {
      expect(cost('You can target 1 monster on the field')).toEqual({});
    });

    it('records nothing for "choose"/"select" clauses', () => {
      expect(cost('choose 1 Spell Card from your Deck')).toEqual({});
      expect(cost('Select 1 Trap Card on the field')).toEqual({});
    });

    it('still records a real cost stated alongside a target', () => {
      expect(
        cost('You can discard 1 card and target 1 monster in your GY'),
      ).toMatchObject({ discard: 1 });
    });

    it('keeps an unmodelled non-targeting cost verbatim', () => {
      expect(
        cost('You can send 2 face-up cards you control to the GY'),
      ).toMatchObject({
        other: ['You can send 2 face-up cards you control to the GY'],
      });
    });
  });
});
