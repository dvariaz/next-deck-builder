import {
  insensitiveContains,
  levelOrLinkRange,
  linkMarkerFilter,
  numericRange,
} from './card-where.builder';

describe('card-where.builder', () => {
  describe('insensitiveContains', () => {
    it('builds a case-insensitive contains filter', () => {
      expect(insensitiveContains('dragon')).toEqual({
        contains: 'dragon',
        mode: 'insensitive',
      });
    });

    it('returns undefined for undefined', () => {
      expect(insensitiveContains(undefined)).toBeUndefined();
    });

    it('returns undefined for an empty string, so the key is omitted entirely', () => {
      expect(insensitiveContains('')).toBeUndefined();
    });
  });

  describe('numericRange', () => {
    it('returns undefined when neither bound is provided', () => {
      expect(numericRange(undefined, undefined)).toBeUndefined();
    });

    it('builds both bounds', () => {
      expect(numericRange(1000, 3000)).toEqual({ gte: 1000, lte: 3000 });
    });

    it('omits lte when only the min bound is given', () => {
      const range = numericRange(2500, undefined);
      expect(range).toEqual({ gte: 2500 });
      expect(range).not.toHaveProperty('lte');
    });

    it('omits gte when only the max bound is given', () => {
      const range = numericRange(undefined, 1500);
      expect(range).toEqual({ lte: 1500 });
      expect(range).not.toHaveProperty('gte');
    });

    it('treats 0 as a real bound, not as absent', () => {
      expect(numericRange(0, 0)).toEqual({ gte: 0, lte: 0 });
    });
  });

  describe('levelOrLinkRange', () => {
    it('returns undefined when neither bound is provided', () => {
      expect(levelOrLinkRange(undefined, undefined)).toBeUndefined();
    });

    it('matches either the level or the linkVal column', () => {
      expect(levelOrLinkRange(4, 8)).toEqual({
        OR: [{ level: { gte: 4, lte: 8 } }, { linkVal: { gte: 4, lte: 8 } }],
      });
    });

    it('propagates an open-ended range to both columns', () => {
      expect(levelOrLinkRange(3, undefined)).toEqual({
        OR: [{ level: { gte: 3 } }, { linkVal: { gte: 3 } }],
      });
    });
  });

  describe('linkMarkerFilter', () => {
    it('returns undefined when no markers are selected', () => {
      expect(linkMarkerFilter(undefined, false)).toBeUndefined();
      expect(linkMarkerFilter([], true)).toBeUndefined();
    });

    it('builds a hasEvery filter and no NOT clause when non-strict', () => {
      const filter = linkMarkerFilter(['top', 'bottom'], false);
      expect(filter).toEqual({ linkMarkers: { hasEvery: ['top', 'bottom'] } });
      expect(filter).not.toHaveProperty('NOT');
    });

    it('adds the complement as a NOT hasSome clause when strict', () => {
      expect(linkMarkerFilter(['top', 'bottom'], true)).toEqual({
        linkMarkers: { hasEvery: ['top', 'bottom'] },
        NOT: {
          linkMarkers: {
            hasSome: [
              'right',
              'left',
              'top-left',
              'top-right',
              'bottom-right',
              'bottom-left',
            ],
          },
        },
      });
    });

    it('produces an empty complement when every marker is selected', () => {
      const all = [
        'top',
        'right',
        'bottom',
        'left',
        'top-left',
        'top-right',
        'bottom-right',
        'bottom-left',
      ];
      expect(linkMarkerFilter(all, true)).toEqual({
        linkMarkers: { hasEvery: all },
        NOT: { linkMarkers: { hasSome: [] } },
      });
    });
  });
});
