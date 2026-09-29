import { EffectZone } from './card-effect.types';
import {
  MASK_RE,
  leadingMaskIndex,
  maskedNameIndexes,
  preprocess,
  unmask,
} from './normalize';

/**
 * Card aliases — "this card is also treated as X".
 *
 * This is a projection of the card's IDENTITY, deliberately separate from the
 * effect IR: it describes what a card *is*, not what it *does*. Keeping it out
 * of `ParsedCardEffects` means it needs no PARSER_VERSION bump, is never
 * persisted, and therefore can never go stale against the pool.
 *
 * Two forms exist in real text, and the difference between them is the whole
 * point of this module:
 *
 *   (This card is always treated as "Fallen of Albaz".)
 *     — unconditional. True in the Deck, so a Deck search finds it.
 *
 *   This card's name becomes "Red Dragon Archfiend" while on the field or in
 *   the GY.
 *     — conditional. A GY revival of "Red Dragon Archfiend" reaches Scarred
 *       Dragon Archfiend; a Deck search for it must NOT, because in the Deck
 *       the card is still only itself.
 *
 * Dropping the zone condition would turn every one of those 102 cards into a
 * wrong edge, which is exactly the failure this feature is built to avoid.
 */

export type CardAliasKind =
  /** A specific card: `always treated as "Fallen of Albaz"`. */
  | 'NAME'
  /** A family: `always treated as a "Blue-Eyes" card`. */
  | 'FAMILY';

export interface CardAlias {
  /** The name or family this card is also treated as. */
  name: string;
  kind: CardAliasKind;
  /** Zones the alias holds in. `null` means always, everywhere, incl. the Deck. */
  zones: EffectZone[] | null;
  /** The exact sentence this came from. Same audit contract as EffectAction. */
  sourceText: string;
}

/**
 * `This card is always treated as ...` / `This card's name is always treated
 * as ...`.
 *
 * The subject is pinned to `this card` / `this card's name` so that
 * `This card's original Level is always treated as 12.` cannot match — it is
 * the same phrasing applied to a stat rather than a name.
 *
 * The tail stops at `.` or `)`: every one of these is a parenthetical
 * one-liner, and an unbounded tail would swallow quoted names from the
 * sentences that follow.
 */
const ALWAYS_RE =
  /\bthis card(?:'s name)? is (?:also )?always treated as\b([^.)]*)/gi;

/**
 * `This card's name becomes "X" while <zone>`.
 *
 * The mask token must follow `becomes` IMMEDIATELY. Without that anchor,
 * "this card's name becomes the sent monster's name ... then Special Summon 1
 * "Magnet Warrior" ..." (Epsilon The Magnet Warrior) would capture the
 * unrelated quoted name later in the sentence and invent an alias.
 */
const BECOMES_RE = /\bthis card's name becomes\b([^.]*)/gi;

const WHILE_RE = /\bwhile\b(.*)$/i;

/** A noun marking the quoted token as a family rather than one card. */
const FAMILY_NOUN_RE = /\b(?:cards?|monsters?)\b/i;

/**
 * Zone phrases, most specific first.
 *
 * Each match is blanked out of the clause before the next pattern runs, so
 * `Field Zone` cannot also trip the bare `field` rule. The named zones imply
 * `FIELD` as well, because a card in the Spell & Trap Zone is on the field and
 * an effect sourcing `FIELD` must see it.
 *
 * The vocabulary is closed: these cover all 18 distinct `while` clauses in the
 * pool. Anything else yields no zones, and an alias with no zones is dropped.
 */
const ZONE_PHRASES: readonly [RegExp, readonly EffectZone[]][] = [
  [/\bmonster zone\b/gi, [EffectZone.MONSTER_ZONE, EffectZone.FIELD]],
  [/\bspell & trap zone\b/gi, [EffectZone.ST_ZONE, EffectZone.FIELD]],
  [/\bpendulum zone\b/gi, [EffectZone.PENDULUM_ZONE, EffectZone.FIELD]],
  [/\bfield zone\b/gi, [EffectZone.FIELD_ZONE, EffectZone.FIELD]],
  [/\bfield\b/gi, [EffectZone.FIELD]],
  [/\bGY\b/gi, [EffectZone.GY]],
  [/\bhand\b/gi, [EffectZone.HAND]],
  [/\bdeck\b/gi, [EffectZone.DECK]],
];

/**
 * Zones named in a `while ...` clause. Empty means "not understood" — the
 * caller must drop the alias rather than assume it always applies.
 */
export function zonesInClause(clause: string): EffectZone[] {
  let rest = clause;
  const zones = new Set<EffectZone>();

  for (const [pattern, add] of ZONE_PHRASES) {
    pattern.lastIndex = 0;
    if (!pattern.test(rest)) continue;
    for (const zone of add) zones.add(zone);
    rest = rest.replace(pattern, ' ');
  }

  return [...zones];
}

/** The masked tail, with mask tokens removed, for noun detection. */
const withoutTokens = (text: string) => text.replace(MASK_RE, ' ');

/**
 * Every alias a card grants itself.
 *
 * Runs on `preprocess` output, so quoted card names are already masked — which
 * is what makes "treated as a "Number 39: Utopia" card" safe to parse at all.
 */
export function parseCardAliases(description: string): CardAlias[] {
  if (!description) return [];

  const { masked, names } = preprocess(description);
  const aliases: CardAlias[] = [];

  const push = (
    name: string | undefined,
    kind: CardAliasKind,
    zones: EffectZone[] | null,
    sourceText: string,
  ) => {
    if (!name) return;
    aliases.push({ name, kind, zones, sourceText });
  };

  // --- unconditional: "is always treated as" -------------------------------
  ALWAYS_RE.lastIndex = 0;
  for (const match of masked.matchAll(ALWAYS_RE)) {
    const tail = match[1] ?? '';
    const indexes = maskedNameIndexes(tail);
    if (!indexes.length) continue;

    // `a "X" card` / `a card "X"` name a family; a bare `"X"` names one card.
    const kind: CardAliasKind = FAMILY_NOUN_RE.test(withoutTokens(tail))
      ? 'FAMILY'
      : 'NAME';

    for (const index of indexes) {
      push(names[index], kind, null, sentenceFrom(masked, names, match.index));
    }
  }

  // --- conditional: "name becomes X while <zone>" --------------------------
  BECOMES_RE.lastIndex = 0;
  for (const match of masked.matchAll(BECOMES_RE)) {
    const tail = match[1] ?? '';
    const index = leadingMaskIndex(tail);
    const whileClause = WHILE_RE.exec(tail);
    if (index === undefined || !whileClause) continue;

    const zones = zonesInClause(whileClause[1]);
    // An unrecognised condition is not "always" — say nothing instead.
    if (!zones.length) continue;

    push(names[index], 'NAME', zones, sentenceFrom(masked, names, match.index));
  }

  return dedupe(aliases);
}

/**
 * The sentence a match opens, unmasked, for the audit trail.
 *
 * Anchored on the match rather than walked back to the previous full stop:
 * `preprocess` collapses the newline between a Synchro Monster's material line
 * and its effect text, and that line ends in no punctuation, so walking back
 * would prepend "1 Tuner + 1+ non-Tuner DARK monsters" to the alias sentence.
 * The parenthesis is re-attached because these usually print as an aside.
 */
function sentenceFrom(masked: string, names: string[], offset: number): string {
  const open = masked[offset - 1] === '(' ? offset - 1 : offset;
  const dot = masked.indexOf('.', offset);
  const stop = dot === -1 ? masked.length : dot + 1;
  const close = masked[stop] === ')' ? stop + 1 : stop;

  return unmask(masked.slice(open, close), names).trim();
}

function dedupe(aliases: CardAlias[]): CardAlias[] {
  const seen = new Set<string>();
  return aliases.filter((alias) => {
    const key = `${alias.name}|${alias.kind}|${alias.zones?.join(',') ?? '*'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Zones that are all "on the field". An effect sourcing `FIELD` must see an
 * alias scoped to the Spell & Trap Zone, and vice versa.
 */
const FIELD_ZONES: readonly EffectZone[] = [
  EffectZone.MONSTER_ZONE,
  EffectZone.ST_ZONE,
  EffectZone.PENDULUM_ZONE,
  EffectZone.FIELD_ZONE,
];

function expandFieldZones(zones: readonly EffectZone[]): Set<EffectZone> {
  const out = new Set(zones);
  if (zones.some((zone) => FIELD_ZONES.includes(zone))) {
    out.add(EffectZone.FIELD);
  }
  if (out.has(EffectZone.FIELD)) for (const zone of FIELD_ZONES) out.add(zone);
  return out;
}

/**
 * Whether an alias holds for a card sitting in any of `effectZones`.
 *
 * This is the rule that keeps conditional aliases honest: a card is only
 * called by its alias where the text says it is, and a search picks its target
 * out of the zone it is searching. `Special Summon 1 "Red Dragon Archfiend"
 * from your GY` reaches Scarred Dragon Archfiend; `Add 1 "Red Dragon
 * Archfiend" from your Deck to your hand` does not.
 *
 * An effect naming no zone matches only unconditional aliases — guessing would
 * be the one mistake this whole module exists to avoid.
 */
export function aliasAppliesInZones(
  aliasZones: EffectZone[] | null,
  effectZones: readonly EffectZone[],
): boolean {
  if (aliasZones === null) return true;
  if (!effectZones.length) return false;

  const wanted = expandFieldZones(effectZones);
  return [...expandFieldZones(aliasZones)].some((zone) => wanted.has(zone));
}
