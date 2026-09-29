import {
  EffectVerb,
  EffectZone,
  type CardEffect,
  type EffectAction,
  type EffectCost,
  type EffectDestination,
  type EffectRestrictions,
  type EffectTarget,
  type ParsedCardEffects,
  type ZoneRef,
} from '../card-effect-parser/card-effect.types';

/**
 * Projection of the general effect IR onto the search graph.
 *
 * The parser models everything a card does; the graph only draws edges for
 * actions that put a card somewhere you can use it. This module is the whole
 * of that translation, and it is pure so it can be spec'd without a database.
 */

/** The verbs that can put a card into your hand or onto your field. */
export const SEARCH_VERBS = [
  EffectVerb.ADD,
  EffectVerb.SPECIAL_SUMMON,
  EffectVerb.NORMAL_SUMMON,
  EffectVerb.SET,
] as const;

export type SearchVerb = (typeof SEARCH_VERBS)[number];

/**
 * Edge classifications. These are DERIVED from (verb, sourceZones, cost) and
 * are never stored - a card's classification changes if the parser improves,
 * and there is no second source of truth to keep in sync.
 */
export const SearchKind = {
  /** Add to hand from the Deck. The classic tutor. */
  DECK_SEARCH: 'DECK_SEARCH',
  /** Add to hand from the GY. */
  GY_SALVAGE: 'GY_SALVAGE',
  /** Add to hand from among your banished cards. */
  BANISH_RETRIEVAL: 'BANISH_RETRIEVAL',
  /** Special Summon straight out of the Deck. */
  DECK_SUMMON: 'DECK_SUMMON',
  /** Special Summon from the GY. */
  REVIVAL: 'REVIVAL',
  /** Special Summon from the hand - a hand extender. */
  HAND_EXTENDER: 'HAND_EXTENDER',
  /** Anything reaching the Extra Deck. */
  EXTRA_DECK_ACCESS: 'EXTRA_DECK_ACCESS',
  /** Set face-down straight from the Deck. */
  SET_FROM_DECK: 'SET_FROM_DECK',
  /** An additional Normal Summon, or one without Tributing. */
  EXTRA_NORMAL_SUMMON: 'EXTRA_NORMAL_SUMMON',
  /** Paid for with a discard, Tribute, banish, LP or deck thinning. */
  WITH_COST: 'WITH_COST',
  /** Reaches into your opponent's zones. */
  OPPONENT_ZONE: 'OPPONENT_ZONE',
} as const;
export type SearchKind = (typeof SearchKind)[keyof typeof SearchKind];

export interface SearchEffect {
  /** `${effect.id}.${actionIndex}` — stable within the card. */
  id: string;
  verb: SearchVerb;
  sourceZones: ZoneRef[];
  destination?: EffectDestination;
  target: EffectTarget;
  kinds: SearchKind[];
  /** Display-ready cost labels, e.g. ["Discard 1", "Pay 1000 LP"]. */
  costs: string[];
  /** Display-ready restriction labels, e.g. ["Hard once per turn"]. */
  restrictions: string[];
  optional: boolean;
  sourceText: string;
}

const isSearchVerb = (verb: EffectVerb): verb is SearchVerb =>
  (SEARCH_VERBS as readonly EffectVerb[]).includes(verb);

const hasZone = (zones: ZoneRef[], zone: EffectZone) =>
  zones.some((z) => z.zone === zone);

/**
 * Zones a Fusion/Synchro/Xyz/Link monster can never occupy.
 *
 * The Main Deck is the obvious one - those monsters are mechanically required
 * to start in the Extra Deck. The HAND is the same case and easy to miss: an
 * Extra Deck monster returned to the hand goes to the Extra Deck instead, so
 * it can never be held. "Special Summon 1 \"Swordsoul\" monster from your hand
 * or Deck" therefore cannot reach the Swordsoul Synchro Monsters.
 *
 * The GY and the banished pile are NOT in this set: Extra Deck monsters get
 * there plenty of ways (used as material, milled, banished as a cost).
 */
const NO_EXTRA_DECK_ZONES: readonly EffectZone[] = [
  EffectZone.DECK,
  EffectZone.HAND,
];

/**
 * Whether a search can be narrowed to exclude Extra Deck monsters.
 *
 * True only when EVERY source zone is one an Extra Deck monster cannot be in.
 * "from your Deck or GY" must NOT qualify - the GY half of that search reaches
 * them legitimately, and excluding them there would drop real edges.
 */
export function excludesExtraDeck(sourceZones: ZoneRef[]): boolean {
  return (
    sourceZones.length > 0 &&
    sourceZones.every((z) => NO_EXTRA_DECK_ZONES.includes(z.zone))
  );
}

/** An additional Normal Summon reads as a lifted restriction, not a fetch. */
const EXTRA_NS_RE = /\b(?:additional|without Tributing|1 more time)\b/i;

function costLabels(cost: EffectCost): string[] {
  const labels: string[] = [];
  const count = (value: number | 'ANY') => (value === 'ANY' ? '' : ` ${value}`);

  if (cost.discard !== undefined) labels.push(`Discard${count(cost.discard)}`);
  if (cost.tribute !== undefined) labels.push(`Tribute${count(cost.tribute)}`);
  if (cost.banish !== undefined) labels.push(`Banish${count(cost.banish)}`);
  if (cost.sendDeckToGy !== undefined) {
    labels.push(`Mill${count(cost.sendDeckToGy)}`);
  }
  if (cost.payLifePoints !== undefined) {
    labels.push(`Pay ${cost.payLifePoints} LP`);
  }
  for (const other of cost.other ?? []) labels.push(other);

  return labels;
}

function restrictionLabels(restrictions: EffectRestrictions): string[] {
  const labels: string[] = [];

  if (restrictions.hardOncePerTurn) {
    const { scope } = restrictions.hardOncePerTurn;
    labels.push(
      scope === 'ACTIVATION'
        ? 'Hard once per turn (activation)'
        : scope === 'SUMMON'
          ? 'Hard once per turn (summon)'
          : 'Hard once per turn',
    );
  } else if (restrictions.softOncePerTurn) {
    labels.push('Once per turn');
  }

  for (const name of restrictions.exceptNames) labels.push(`Except "${name}"`);
  labels.push(...restrictions.labels);

  return labels;
}

/** Derive the edge classifications for one action. */
export function deriveSearchKinds(
  action: EffectAction,
  cost: EffectCost,
): SearchKind[] {
  const kinds = new Set<SearchKind>();
  const { verb, sourceZones } = action;

  if (verb === EffectVerb.ADD) {
    if (hasZone(sourceZones, EffectZone.DECK))
      kinds.add(SearchKind.DECK_SEARCH);
    if (hasZone(sourceZones, EffectZone.GY)) kinds.add(SearchKind.GY_SALVAGE);
    if (hasZone(sourceZones, EffectZone.BANISHED)) {
      kinds.add(SearchKind.BANISH_RETRIEVAL);
    }
  }

  if (verb === EffectVerb.SPECIAL_SUMMON) {
    if (hasZone(sourceZones, EffectZone.DECK))
      kinds.add(SearchKind.DECK_SUMMON);
    if (hasZone(sourceZones, EffectZone.GY)) kinds.add(SearchKind.REVIVAL);
    if (hasZone(sourceZones, EffectZone.HAND)) {
      kinds.add(SearchKind.HAND_EXTENDER);
    }
  }

  // Orthogonal to the verb: reaching the Extra Deck is its own thing.
  if (hasZone(sourceZones, EffectZone.EXTRA_DECK)) {
    kinds.add(SearchKind.EXTRA_DECK_ACCESS);
  }

  if (verb === EffectVerb.SET && hasZone(sourceZones, EffectZone.DECK)) {
    kinds.add(SearchKind.SET_FROM_DECK);
  }

  if (
    verb === EffectVerb.NORMAL_SUMMON &&
    EXTRA_NS_RE.test(action.sourceText)
  ) {
    kinds.add(SearchKind.EXTRA_NORMAL_SUMMON);
  }

  if (Object.keys(cost).length > 0) kinds.add(SearchKind.WITH_COST);

  if (sourceZones.some((z) => z.owner === 'OPPONENT')) {
    kinds.add(SearchKind.OPPONENT_ZONE);
  }

  return [...kinds];
}

export interface ProjectOptions {
  /** Drop effects that only reach the opponent's zones. Defaults to true. */
  selfOnly?: boolean;
}

/**
 * Project a parsed card into the search effects the graph draws edges from.
 *
 * Keeps only resolved actions with a search verb - everything else stays in
 * the IR for other consumers.
 */
export function projectSearchEffects(
  parsed: ParsedCardEffects | null | undefined,
  options: ProjectOptions = {},
): SearchEffect[] {
  if (!parsed?.effects?.length) return [];
  const selfOnly = options.selfOnly ?? true;

  const projected: SearchEffect[] = [];

  for (const effect of parsed.effects as CardEffect[]) {
    effect.actions.forEach((action, actionIndex) => {
      if (!action.resolved) return;
      if (!isSearchVerb(action.verb)) return;

      const kinds = deriveSearchKinds(action, effect.cost);

      if (
        selfOnly &&
        action.sourceZones.length > 0 &&
        action.sourceZones.every((z) => z.owner === 'OPPONENT')
      ) {
        return;
      }

      projected.push({
        id: `${effect.id}.${actionIndex}`,
        verb: action.verb,
        sourceZones: action.sourceZones,
        destination: action.destination,
        target: action.target,
        kinds,
        costs: costLabels(effect.cost),
        restrictions: restrictionLabels(effect.restrictions),
        optional: effect.optional,
        sourceText: action.sourceText,
      });
    });
  }

  return projected;
}
