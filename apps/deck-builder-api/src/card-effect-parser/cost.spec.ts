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
});
