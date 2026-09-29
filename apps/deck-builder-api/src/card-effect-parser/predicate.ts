import {
  CardType,
  MonsterEffectType,
  SpellTrapSubType,
  SummonType,
} from '../../generated/prisma/enums';
import type { EffectPredicate, ParserContext } from './card-effect.types';

/**
 * Stage 4 — turn a target noun phrase into a queryable predicate.
 *
 * "1 Level 4 or lower Warrior monster" becomes
 * `{ cardType: [MONSTER], race: ['Warrior'], levelMax: 4 }`.
 *
 * The rules are an ordered table and the order is load-bearing; each hazard is
 * called out at its rule and covered by a dedicated spec case.
 */

export const ATTRIBUTES = [
  'DARK',
  'LIGHT',
  'EARTH',
  'WATER',
  'FIRE',
  'WIND',
  'DIVINE',
] as const;

const ATTRIBUTE_RE = /\b(DARK|LIGHT|EARTH|WATER|FIRE|WIND|DIVINE)\b/g;

/** "non-Tuner" MUST be tested before "Tuner" or every non-Tuner reads as a Tuner. */
const NON_TUNER_RE = /\bnon-Tuner\b/i;
const TUNER_RE = /\bTuner\b/i;

/** Bounded forms first; the lookahead on the exact form is belt-and-braces. */
const LEVEL_MAX_RE = /\bLevel\s+(\d+)\s+or\s+lower\b/i;
const LEVEL_MIN_RE = /\bLevel\s+(\d+)\s+or\s+higher\b/i;
const LEVEL_EXACT_RE = /\bLevel\s+(\d+)\b(?!\s+or\s+(?:lower|higher))/i;

const RANK_RE = /\bRank\s+(\d+)(?:\s+or\s+(lower|higher))?\b/i;
const LINK_RE = /\bLink[-\s](\d+)(?:\s+or\s+(lower|higher))?\b/i;

const ATK_MAX_RE = /\bwith\s+([\d,]+)\s+or\s+less\s+ATK\b/i;
const ATK_MIN_RE = /\bwith\s+([\d,]+)\s+or\s+more\s+ATK\b/i;
const DEF_MAX_RE = /\bwith\s+([\d,]+)\s+or\s+less\s+DEF\b/i;
const DEF_MIN_RE = /\bwith\s+([\d,]+)\s+or\s+more\s+DEF\b/i;

/** Must precede the bare `monster` fallback. */
const ST_SUBTYPE_RE =
  /\b(Field|Equip|Continuous|Quick-Play|Counter|Ritual|Normal)\s+(Spell|Trap)\b/i;
const ST_BOTH_RE = /\bSpell\/Trap(?:\s+Cards?)?\b/i;
const SPELL_RE = /\bSpell(?:\s+Cards?)?\b/i;
const TRAP_RE = /\bTrap(?:\s+Cards?)?\b/i;

/**
 * Extra Deck summon classes resolve to `summonType`, never `frameType` — the
 * seeder collapses `fusion_pendulum` and friends to `PENDULUM`, so a frameType
 * rule silently misses 32 monsters.
 */
const SUMMON_CLASS_RE = /\b(Fusion|Synchro|Xyz|Link|Ritual)\s+Monsters?\b/i;
const PENDULUM_MONSTER_RE = /\bPendulum\s+Monsters?\b/i;
const NORMAL_MONSTER_RE = /\bNormal\s+Monsters?\b/i;
const EFFECT_MONSTER_RE = /\bEffect\s+Monsters?\b/i;
const MONSTER_RE = /\bmonsters?\b/i;

const ST_SUBTYPE_MAP: Record<string, SpellTrapSubType> = {
  field: SpellTrapSubType.FIELD,
  equip: SpellTrapSubType.EQUIP,
  continuous: SpellTrapSubType.CONTINUOUS,
  'quick-play': SpellTrapSubType.QUICK_PLAY,
  counter: SpellTrapSubType.COUNTER,
  ritual: SpellTrapSubType.RITUAL,
  normal: SpellTrapSubType.NORMAL,
};

const SUMMON_CLASS_MAP: Record<string, SummonType> = {
  fusion: SummonType.FUSION,
  synchro: SummonType.SYNCHRO,
  xyz: SummonType.XYZ,
  link: SummonType.LINK,
  ritual: SummonType.RITUAL,
};

const toInt = (raw: string) => Number(raw.replace(/,/g, ''));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Match monster Types (Warrior, Psychic, ...) from the injected vocabulary.
 *
 * Longest-match-first with span blanking, so "Winged Beast" wins over "Beast"
 * and cannot also register as "Beast". Accepts the legacy "-Type" suffix:
 * 795 cards still print "Psychic-Type monster".
 */
function matchRaces(np: string, races: ReadonlySet<string>): string[] {
  const candidates = [...races]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  let remaining = np;
  const found: { race: string; at: number }[] = [];

  for (const race of candidates) {
    const re = new RegExp(`\\b${escapeRe(race)}(?:-Type)?\\b`, 'i');
    const match = re.exec(remaining);
    if (!match) continue;
    found.push({ race, at: match.index });
    // Blank the matched span so a shorter race cannot match inside it.
    remaining =
      remaining.slice(0, match.index) +
      ' '.repeat(match[0].length) +
      remaining.slice(match.index + match[0].length);
  }

  // Return in the order they appear in the text, not in vocabulary order, so
  // the predicate is a deterministic function of the phrase.
  return found.sort((a, b) => a.at - b.at).map((f) => f.race);
}

/** True when nothing at all was constrained — such a predicate matches the whole pool. */
export function isEmptyPredicate(p: EffectPredicate): boolean {
  return !Object.entries(p).some(([key, value]) => {
    if (key === 'excludeNames') return false; // an exclusion alone constrains nothing
    if (value === undefined) return false;
    return Array.isArray(value) ? value.length > 0 : true;
  });
}

/**
 * Parse a target noun phrase into a predicate.
 *
 * Returns whatever it could determine; callers use `isEmptyPredicate` to decide
 * whether the result is specific enough to draw a graph edge from.
 */
export function parsePredicate(
  np: string,
  ctx: ParserContext,
): EffectPredicate {
  const p: EffectPredicate = {};

  // --- card type / subtype -------------------------------------------------
  const stSubtype = ST_SUBTYPE_RE.exec(np);
  if (stSubtype) {
    const [, subtype, kind] = stSubtype;
    p.cardType = [
      kind.toLowerCase() === 'spell' ? CardType.SPELL : CardType.TRAP,
    ];
    const mapped = ST_SUBTYPE_MAP[subtype.toLowerCase()];
    if (mapped) p.spellTrapSubType = [mapped];
  } else if (ST_BOTH_RE.test(np)) {
    p.cardType = [CardType.SPELL, CardType.TRAP];
  } else {
    const summonClass = SUMMON_CLASS_RE.exec(np);
    if (summonClass) {
      p.cardType = [CardType.MONSTER];
      const mapped = SUMMON_CLASS_MAP[summonClass[1].toLowerCase()];
      if (mapped) p.summonType = [mapped];
    } else if (NORMAL_MONSTER_RE.test(np)) {
      p.cardType = [CardType.MONSTER];
      p.monsterEffectType = [MonsterEffectType.NORMAL];
    } else if (EFFECT_MONSTER_RE.test(np)) {
      p.cardType = [CardType.MONSTER];
      p.monsterEffectType = [MonsterEffectType.EFFECT];
    } else if (MONSTER_RE.test(np)) {
      p.cardType = [CardType.MONSTER];
    } else if (SPELL_RE.test(np)) {
      p.cardType = [CardType.SPELL];
    } else if (TRAP_RE.test(np)) {
      p.cardType = [CardType.TRAP];
    }
  }

  if (PENDULUM_MONSTER_RE.test(np)) {
    p.cardType = [CardType.MONSTER];
    p.isPendulum = true;
  }

  // --- level / rank / link -------------------------------------------------
  const rank = RANK_RE.exec(np);
  const link = LINK_RE.exec(np);

  if (rank) {
    const value = toInt(rank[1]);
    const bound = rank[2]?.toLowerCase();
    if (bound === 'lower') p.levelMax = value;
    else if (bound === 'higher') p.levelMin = value;
    else {
      p.levelMin = value;
      p.levelMax = value;
    }
    // Rank only exists on Xyz monsters.
    p.cardType = [CardType.MONSTER];
    p.summonType = [SummonType.XYZ];
  } else if (link) {
    const value = toInt(link[1]);
    const bound = link[2]?.toLowerCase();
    if (bound === 'lower') p.linkValMax = value;
    else if (bound === 'higher') p.linkValMin = value;
    else {
      p.linkValMin = value;
      p.linkValMax = value;
    }
    p.cardType = [CardType.MONSTER];
    p.summonType = [SummonType.LINK];
  } else {
    const levelMax = LEVEL_MAX_RE.exec(np);
    const levelMin = LEVEL_MIN_RE.exec(np);
    if (levelMax) p.levelMax = toInt(levelMax[1]);
    if (levelMin) p.levelMin = toInt(levelMin[1]);
    if (!levelMax && !levelMin) {
      const exact = LEVEL_EXACT_RE.exec(np);
      if (exact) {
        p.levelMin = toInt(exact[1]);
        p.levelMax = toInt(exact[1]);
      }
    }
  }

  // --- ATK / DEF -----------------------------------------------------------
  const atkMax = ATK_MAX_RE.exec(np);
  if (atkMax) p.atkMax = toInt(atkMax[1]);
  const atkMin = ATK_MIN_RE.exec(np);
  if (atkMin) p.atkMin = toInt(atkMin[1]);
  const defMax = DEF_MAX_RE.exec(np);
  if (defMax) p.defMax = toInt(defMax[1]);
  const defMin = DEF_MIN_RE.exec(np);
  if (defMin) p.defMin = toInt(defMin[1]);

  // --- attribute -----------------------------------------------------------
  // "non-DARK" is an exclusion this predicate cannot express, so skip those
  // rather than inverting the meaning.
  const attributes = [...np.matchAll(ATTRIBUTE_RE)]
    .filter((m) => !/non-$/i.test(np.slice(Math.max(0, m.index - 4), m.index)))
    .map((m) => m[1].toUpperCase());
  if (attributes.length) p.attribute = [...new Set(attributes)];

  // --- tuner ---------------------------------------------------------------
  if (NON_TUNER_RE.test(np)) p.isTuner = false;
  else if (TUNER_RE.test(np)) {
    p.isTuner = true;
    p.cardType = [CardType.MONSTER];
  }

  // --- race (monsters only) ------------------------------------------------
  if (p.cardType?.includes(CardType.MONSTER)) {
    const races = matchRaces(np, ctx.races);
    if (races.length) p.race = races;
  }

  return p;
}
