/**
 * Canonical set of link-arrow marker directions, stored lowercase to match the
 * seeded `Card.linkMarkers` values. Used to compute the complement for strict
 * (exact-set) link-marker filtering.
 */
export const LINK_MARKERS = [
  'top',
  'right',
  'bottom',
  'left',
  'top-left',
  'top-right',
  'bottom-right',
  'bottom-left',
] as const;
