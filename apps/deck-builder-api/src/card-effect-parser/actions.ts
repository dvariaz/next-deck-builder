import {
  EffectDestination,
  EffectVerb,
  EffectZone,
  type EffectAction,
  type ParserContext,
  type ZoneOwner,
  type ZoneRef,
} from './card-effect.types';
import { unmaskBare } from './normalize';
import { isResolvedTarget, parseTargets } from './target';

/**
 * Stage 6 — turn one resolution segment into an action.
 *
 * Guards run first and reject the whole segment; only then does the verb /
 * zone / destination machinery run. Because clause splitting has already
 * removed triggers and costs, the guards here only have to catch what is left.
 */

/**
 * Negation. Kills the segment outright.
 *
 * This is what stops Snake-Eyes Ash's "you cannot Special Summon monsters for
 * the rest of this turn, except FIRE monsters" from parsing as a Special
 * Summon with an exclusion - one of the most-played cards in the game, and a
 * garbage edge if this rule is missing.
 */
const NEGATION_RE =
  /\b(?:cannot|can not|can't|unable to|instead of|without|neither player|no player)\b/i;

/**
 * Passive voice marks a description of something happening, not an action you
 * take: "If a monster is Special Summoned from your Deck" is a condition.
 * English voice is a reliable discriminator in PSCT.
 */
const PASSIVE_RE =
  /\b(?:is|are|was|were|being|gets?|becomes?)\s+(?:successfully\s+)?(?:Special\s+|Normal\s+|Flip\s+)?(?:Summoned|added|sent|banished|Set|returned|revealed|excavated|destroyed|negated)\b/i;

/** Ordered so multi-word verbs win over any prefix of themselves. */
const VERB_PATTERNS: { verb: EffectVerb; re: RegExp }[] = [
  { verb: EffectVerb.SPECIAL_SUMMON, re: /\bSpecial Summon\b/i },
  { verb: EffectVerb.NORMAL_SUMMON, re: /\bNormal Summon\b/i },
  { verb: EffectVerb.ADD, re: /\bAdd\b/i },
  // "Set" is also an adjective ("1 Set card in your opponent's S/T Zone"), so
  // require a count or "this card" after it to read it as a verb.
  { verb: EffectVerb.SET, re: /\bSet\s+(?=\d|this\b|an?\b)/i },
  { verb: EffectVerb.SEND, re: /\bSend\b/i },
  { verb: EffectVerb.BANISH, re: /\bBanish\b/i },
  { verb: EffectVerb.EXCAVATE, re: /\bExcavate\b/i },
  { verb: EffectVerb.REVEAL, re: /\bReveal\b/i },
  { verb: EffectVerb.RETURN, re: /\bReturn\b/i },
  { verb: EffectVerb.SHUFFLE, re: /\bShuffle\b/i },
  { verb: EffectVerb.DESTROY, re: /\bDestroy\b/i },
  { verb: EffectVerb.NEGATE, re: /\bNegate\b/i },
  { verb: EffectVerb.DRAW, re: /\bDraw\b/i },
  { verb: EffectVerb.PLACE, re: /\bPlace\b/i },
  { verb: EffectVerb.ATTACH, re: /\bAttach\b/i },
  { verb: EffectVerb.EQUIP, re: /\bEquip\b/i },
  { verb: EffectVerb.DISCARD, re: /\bDiscard\b/i },
  { verb: EffectVerb.TRIBUTE, re: /\bTribute\b/i },
];

/** Longer zone names must precede their own suffixes ("Extra Deck" vs "Deck"). */
const ZONE_WORDS =
  '(Extra Deck|Main Deck|Deck|hand|GY|field|Extra Monster Zone|Monster Zone|Pendulum Zone|Spell & Trap Zone)';

const SOURCE_RE = new RegExp(
  `\\bfrom\\s+(your opponent's|your|its owner's|the|either)?\\s*${ZONE_WORDS}\\b`,
  'gi',
);

/** "from your hand or Deck", "from your Deck, hand, or GY". */
const SOURCE_ALT_RE = new RegExp(
  `\\bfrom\\s+(?:your\\s+)?${ZONE_WORDS}(?:\\s*,\\s*(?:your\\s+)?${ZONE_WORDS})?\\s*,?\\s*or\\s+(?:your\\s+)?${ZONE_WORDS}\\b`,
  'i',
);

/** Targeting clauses name the zone with "in" rather than "from". */
const IN_ZONE_RE = new RegExp(
  `\\bin\\s+(either|your opponent's|your|the)\\s+${ZONE_WORDS}\\b`,
  'i',
);

const BANISHED_RE = /\b(?:your |your opponent's )?banished\b/i;

const DEST_RE = new RegExp(
  `\\bto\\s+(?:your\\s+|the\\s+|its owner's\\s+)?${ZONE_WORDS}\\b`,
  'i',
);

const FACE_DOWN_RE = /\bface-down\b/i;

const ZONE_MAP: Record<string, EffectZone> = {
  deck: EffectZone.DECK,
  'main deck': EffectZone.DECK,
  'extra deck': EffectZone.EXTRA_DECK,
  hand: EffectZone.HAND,
  gy: EffectZone.GY,
  field: EffectZone.FIELD,
  'monster zone': EffectZone.MONSTER_ZONE,
  'extra monster zone': EffectZone.MONSTER_ZONE,
  'pendulum zone': EffectZone.PENDULUM_ZONE,
  'spell & trap zone': EffectZone.ST_ZONE,
};

const DEST_MAP: Record<string, EffectDestination> = {
  hand: EffectDestination.HAND,
  gy: EffectDestination.GY,
  deck: EffectDestination.DECK,
  'main deck': EffectDestination.DECK,
  'extra deck': EffectDestination.EXTRA_DECK,
  field: EffectDestination.FIELD_FACE_UP,
  'monster zone': EffectDestination.FIELD_FACE_UP,
  'extra monster zone': EffectDestination.FIELD_FACE_UP,
  'pendulum zone': EffectDestination.PENDULUM_ZONE,
  'spell & trap zone': EffectDestination.FIELD_FACE_UP,
};

function toOwner(raw?: string): ZoneOwner {
  const owner = raw?.toLowerCase().trim();
  if (owner === "your opponent's") return 'OPPONENT';
  if (owner === 'either') return 'EITHER';
  return 'SELF';
}

function toZone(raw: string): EffectZone | undefined {
  return ZONE_MAP[raw.toLowerCase().trim()];
}

interface ZoneScan {
  zones: ZoneRef[];
  /** Offset of the earliest zone mention, for trimming the noun phrase. */
  firstAt: number;
}

/** Find every source zone the segment names, and where the first one starts. */
function scanSourceZones(tail: string): ZoneScan {
  const zones: ZoneRef[] = [];
  let firstAt = tail.length;

  const alt = SOURCE_ALT_RE.exec(tail);
  if (alt) {
    firstAt = alt.index;
    for (const raw of [alt[1], alt[2], alt[3]]) {
      if (!raw) continue;
      const zone = toZone(raw);
      if (zone) zones.push({ zone, owner: 'SELF' });
    }
  } else {
    for (const match of tail.matchAll(SOURCE_RE)) {
      const zone = toZone(match[2]);
      if (!zone) continue;
      zones.push({ zone, owner: toOwner(match[1]) });
      firstAt = Math.min(firstAt, match.index ?? firstAt);
    }
  }

  if (!zones.length) {
    const inZone = IN_ZONE_RE.exec(tail);
    if (inZone) {
      const zone = toZone(inZone[2]);
      if (zone) {
        zones.push({ zone, owner: toOwner(inZone[1]) });
        firstAt = Math.min(firstAt, inZone.index);
      }
    }
  }

  if (!zones.length) {
    const banished = BANISHED_RE.exec(tail);
    if (banished) {
      zones.push({
        zone: EffectZone.BANISHED,
        owner: /opponent/i.test(banished[0]) ? 'OPPONENT' : 'SELF',
      });
      firstAt = Math.min(firstAt, banished.index);
    }
  }

  return { zones, firstAt };
}

export interface ParseActionOptions {
  /** Exclusions found elsewhere in the segment (usually after the destination). */
  inheritedExcept?: string[];
}

/**
 * Parse one resolution segment into its actions — empty when the segment is
 * not an action at all.
 *
 * Usually one action. A segment offering a choice between two differently
 * shaped targets ("Special Summon 1 \"Swordsoul\" monster or 1 \"Fallen of
 * Albaz\"") yields one per target: they share a verb, zones and sourceText,
 * but a single EffectPredicate cannot describe both.
 */
export function parseActions(
  segment: string,
  names: string[],
  ctx: ParserContext,
  options: ParseActionOptions = {},
): EffectAction[] {
  if (NEGATION_RE.test(segment)) return [];
  if (PASSIVE_RE.test(segment)) return [];

  // The first verb in the segment wins.
  let best: { verb: EffectVerb; at: number; length: number } | undefined;
  for (const { verb, re } of VERB_PATTERNS) {
    const match = re.exec(segment);
    if (!match) continue;
    if (!best || match.index < best.at) {
      best = { verb, at: match.index, length: match[0].length };
    }
  }
  if (!best) return [];

  const tail = segment.slice(best.at + best.length);
  const { zones, firstAt } = scanSourceZones(tail);

  const destMatch = DEST_RE.exec(tail);
  const npEnd = Math.min(
    firstAt,
    destMatch ? destMatch.index : tail.length,
    tail.length,
  );
  const np = tail.slice(0, npEnd).trim();

  const targets = parseTargets(np, names, ctx, options.inheritedExcept);

  // --- destination ---------------------------------------------------------
  let destination: EffectDestination | undefined;
  if (destMatch) destination = DEST_MAP[destMatch[1].toLowerCase().trim()];

  let verb = best.verb;

  if (!destination) {
    if (verb === EffectVerb.ADD) destination = EffectDestination.HAND;
    else if (verb === EffectVerb.SET)
      destination = EffectDestination.FIELD_FACE_DOWN;
    else if (verb === EffectVerb.SEND) destination = EffectDestination.GY;
    else if (
      verb === EffectVerb.SPECIAL_SUMMON ||
      verb === EffectVerb.NORMAL_SUMMON
    ) {
      destination = EffectDestination.FIELD_FACE_UP;
    }
  }

  // A summon printed as face-down is a Set in all but name.
  if (
    FACE_DOWN_RE.test(segment) &&
    destination === EffectDestination.FIELD_FACE_UP
  ) {
    destination = EffectDestination.FIELD_FACE_DOWN;
  }

  // "Send ... to the hand" is a bounce, not a mill.
  if (verb === EffectVerb.SEND && destination === EffectDestination.HAND) {
    verb = EffectVerb.RETURN;
  }

  // --- resolution ----------------------------------------------------------
  // A search verb with no source zone cannot be placed on the graph: we would
  // be guessing which zone the card comes from. "this card" is exempt - the
  // card is its own target, wherever it happens to be.
  const needsZone =
    targets.some(({ target }) => target.kind !== 'self') &&
    (verb === EffectVerb.ADD ||
      verb === EffectVerb.SPECIAL_SUMMON ||
      verb === EffectVerb.NORMAL_SUMMON ||
      verb === EffectVerb.SET);

  const sourceText = unmaskBare(segment, names).trim();

  return targets.map(({ target, quantity }) => ({
    verb,
    sourceZones: zones,
    destination,
    target,
    quantity,
    resolved: isResolvedTarget(target) && (!needsZone || zones.length > 0),
    sourceText,
  }));
}

/**
 * The first action a segment yields, or undefined.
 *
 * Kept because almost every caller and spec wants exactly one; `parseActions`
 * is the full answer.
 */
export function parseAction(
  segment: string,
  names: string[],
  ctx: ParserContext,
  options: ParseActionOptions = {},
): EffectAction | undefined {
  return parseActions(segment, names, ctx, options)[0];
}
