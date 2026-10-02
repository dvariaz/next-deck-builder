import {
  Conjunction,
  DEPENDENT_CONJUNCTIONS,
  EffectDestination,
  EffectVerb,
  EffectZone,
  SelectionMode,
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
  /\b(?:is|are|was|were|being|gets?|becomes?)\s+(?:successfully\s+)?(?:Special\s+|Normal\s+|Flip\s+|Fusion\s+|Synchro\s+|Xyz\s+|Link\s+|Ritual\s+|Pendulum\s+)?(?:Summoned|added|sent|banished|Set|returned|revealed|excavated|destroyed|negated)\b/i;

/** Ordered so multi-word verbs win over any prefix of themselves. */
const VERB_PATTERNS: { verb: EffectVerb; re: RegExp }[] = [
  { verb: EffectVerb.SPECIAL_SUMMON, re: /\bSpecial Summon\b/i },
  // Every Fusion, Synchro, Xyz, Link, Ritual and Pendulum Summon IS a Special
  // Summon by the rulebook, so they collapse onto the same verb rather than
  // each getting one of their own. Only Normal Summon and Flip Summon are not.
  //
  // "Fusion Summon 1 "Burning Abyss" Fusion Monster from your Extra Deck" is a
  // search by any useful definition, and without this it produced no action.
  {
    verb: EffectVerb.SPECIAL_SUMMON,
    re: /\b(?:Fusion|Synchro|Xyz|Link|Ritual|Pendulum) Summon\b/i,
  },
  { verb: EffectVerb.NORMAL_SUMMON, re: /\bNormal Summon\b/i },
  { verb: EffectVerb.ADD, re: /\bAdd\b/i },
  // "Set" is also an adjective ("1 Set card in your opponent's S/T Zone"), so
  // require a count, "this card" or a pronoun after it to read it as a verb.
  // The pronoun case is load-bearing: "choose 1 Spell Card from your Deck,
  // then Set it" states the noun phrase in the PRECEDING segment.
  {
    verb: EffectVerb.SET,
    re: /\bSet\s+(?=\d|this\b|an?\b|it\b|them\b|those\b|that\b)/i,
  },
  { verb: EffectVerb.SEND, re: /\bSend\b/i },
  { verb: EffectVerb.BANISH, re: /\bBanish\b/i },
  { verb: EffectVerb.EXCAVATE, re: /\bExcavate\b/i },
  // Pre-2011 spelling of Excavate: "pick up and see the card".
  { verb: EffectVerb.EXCAVATE, re: /\bpick up (?:and see )?/i },
  { verb: EffectVerb.REVEAL, re: /\bReveal\b/i },
  // Pre-2011 spelling of Reveal: "show up to 2 Normal Monster Cards".
  { verb: EffectVerb.REVEAL, re: /\bshow\s+(?=\d|up to\b|an?\b)/i },
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

/**
 * Longer zone names must precede their own suffixes ("Extra Deck" vs "Deck").
 *
 * The optional "Card" covers the pre-2011 spelling — "Spell & Trap Card Zone",
 * "Monster Card Zone" — which is still printed on thousands of cards and which
 * `toZone` folds back onto the modern name.
 */
const ZONE_WORDS =
  '(Extra Deck|Main Deck|Deck|hand|GY|field|Extra Monster Zone|Monster(?: Card)? Zone|Pendulum(?: Card)? Zone|Spell & Trap(?: Card)? Zone)';

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

/**
 * The field stated as control rather than as a zone: "1 monster your opponent
 * controls". Checked last, after every explicit zone, because a phrase can
 * name both ("1 monster in your GY ... you control").
 */
const CONTROLS_RE = /\b(you|your opponent|either player)\s+controls?\b/i;

/**
 * Selection language, most explicit first.
 *
 * "target" is the only one of these that is a game action with its own rules;
 * see SelectionMode for why legacy "select" is reported as its own value
 * rather than folded into either side.
 */
const SELECTION_PATTERNS: { mode: SelectionMode; re: RegExp }[] = [
  { mode: SelectionMode.TARGET, re: /\btarget(?:s|ing|ed)?\b/i },
  { mode: SelectionMode.CHOOSE, re: /\bchoose[sn]?\b/i },
  { mode: SelectionMode.LEGACY_SELECT, re: /\bselect(?:s|ed)?\b/i },
];

/**
 * Where a selection clause's noun phrase begins.
 *
 * PSCT states what an effect acts on in the COST half — "You can target 1
 * monster in your GY; Special Summon it" — so 2,099 cards in the pool describe
 * their noun phrase in a clause the resolution only refers back to by pronoun.
 * The same shape appears across chained resolutions: Alchemic Magician's
 * "choose 1 Spell Card from your Deck, then Set it".
 *
 * Matched GLOBALLY and the LAST hit used, because the nearest antecedent is
 * the right one when a clause contains more than one.
 */
const SELECTION_CLAUSE_RE =
  /\b(?:target(?:s|ing)?|choose[sn]?|select(?:s|ed)?)\s+/gi;

/**
 * A resolution that points back at the targeting clause instead of describing
 * its own noun phrase. Without resolving these, every one of those 2,099 cards
 * yields an `unresolved` target and no edge.
 */
/**
 * Anchored at the START rather than matched whole, because the pronoun is
 * often followed by trailing detail the resolution adds: Alchemic Magician's
 * "Set it in your Spell & Trap Card Zone" is still a pronoun resolution.
 */
const PRONOUN_RE =
  /^(?:it|them|those|that card|that monster|that target|the target(?:ed)? (?:card|monster)|those cards|those monsters)\b/i;

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

/** Fold the legacy "... Card Zone" spelling onto the modern zone name. */
function zoneKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+card\s+zone$/, ' zone')
    .trim();
}

function toZone(raw: string): EffectZone | undefined {
  return ZONE_MAP[zoneKey(raw)];
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

  // "1 monster your opponent controls" names the field without naming a zone.
  if (!zones.length) {
    const controls = CONTROLS_RE.exec(tail);
    if (controls) {
      const who = controls[1].toLowerCase();
      zones.push({
        zone: EffectZone.FIELD,
        owner:
          who === 'your opponent'
            ? 'OPPONENT'
            : who === 'either player'
              ? 'EITHER'
              : 'SELF',
      });
      firstAt = Math.min(firstAt, controls.index);
    }
  }

  return { zones, firstAt };
}

/**
 * Why a segment yields no actions, when the reason is a deliberate rejection
 * rather than a parse failure.
 *
 * The review queue needs this distinction: 922 of the 1,354 sentences the
 * previous version queued were negations the parser rejected ON PURPOSE
 * ("Cannot be Normal Summoned", "You cannot Special Summon monsters"). Queuing
 * them made the needsReview signal ~70% noise and hid the real gaps.
 */
export function segmentRejection(
  segment: string,
): 'NEGATION' | 'PASSIVE' | undefined {
  if (NEGATION_RE.test(segment)) return 'NEGATION';
  if (PASSIVE_RE.test(segment)) return 'PASSIVE';
  return undefined;
}

/** The selection language used anywhere in a clause. */
export function parseSelection(text: string): SelectionMode {
  for (const { mode, re } of SELECTION_PATTERNS) {
    if (re.test(text)) return mode;
  }
  return SelectionMode.NONE;
}

export interface ParseActionOptions {
  /** Exclusions found elsewhere in the segment (usually after the destination). */
  inheritedExcept?: string[];
  /** The conjunction that introduced this segment. See Conjunction. */
  conjunction?: Conjunction;
  /**
   * Everything in the same PSCT clause that precedes this segment: the cost
   * half, then any earlier resolution segments, joined in order.
   *
   * Carries the selection clause a pronoun resolution refers back to, and the
   * selection language itself — modern text states both before the segment
   * that acts on them.
   */
  clauseContext?: string;
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
  if (segmentRejection(segment)) return [];

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

  const destMatch = DEST_RE.exec(tail);

  /** Cut the noun phrase at whichever comes first: a source zone or the destination. */
  const nounPhrase = (text: string, firstZoneAt: number, destAt: number) =>
    text.slice(0, Math.min(firstZoneAt, destAt, text.length)).trim();

  let { zones, firstAt } = scanSourceZones(tail);
  let np = nounPhrase(tail, firstAt, destMatch ? destMatch.index : tail.length);

  // A pronoun resolution ("Special Summon it") describes nothing on its own —
  // the noun phrase and its zone live in the targeting clause before the
  // semicolon. Re-run the scan there rather than returning `unresolved`.
  const context = options.clauseContext ?? '';
  if (PRONOUN_RE.test(np.trim())) {
    const antecedents = [...context.matchAll(SELECTION_CLAUSE_RE)];
    const clause = antecedents[antecedents.length - 1];
    if (clause) {
      const after = context.slice(clause.index + clause[0].length);
      const scan = scanSourceZones(after);
      const afterDest = DEST_RE.exec(after);
      const borrowed = nounPhrase(
        after,
        scan.firstAt,
        afterDest ? afterDest.index : after.length,
      );
      if (borrowed) {
        np = borrowed;
        // The noun phrase and the zone it comes from are stated together, so
        // take both from the antecedent. A zone named in the resolution
        // instead describes where the card GOES: Alchemic Magician's "choose 1
        // Spell Card from your Deck, then Set it in your Spell & Trap Card
        // Zone" searches the Deck and places into the S/T Zone.
        if (scan.zones.length) {
          zones = scan.zones;
          firstAt = scan.firstAt;
        }
      }
    }
  }

  const targets = parseTargets(np, names, ctx, options.inheritedExcept);
  const selection = parseSelection(`${context} ${segment}`);

  // --- destination ---------------------------------------------------------
  let destination: EffectDestination | undefined;
  if (destMatch) destination = DEST_MAP[zoneKey(destMatch[1])];

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

  const conjunction = options.conjunction ?? Conjunction.NONE;

  return targets.map(({ target, quantity }) => ({
    verb,
    sourceZones: zones,
    destination,
    target,
    quantity,
    selection,
    conjunction,
    dependsOnPrevious: DEPENDENT_CONJUNCTIONS.includes(conjunction),
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
