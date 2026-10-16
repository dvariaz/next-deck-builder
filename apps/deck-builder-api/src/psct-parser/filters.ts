/**
 * Noun phrases into queryable constraints.
 *
 * This is where the parser earns its keep for a deck-building tool. A noun
 * phrase like `1 Level 4 or lower DARK Warrior monster` has to become columns —
 * `levelMax: 4`, `attribute: ['DARK']`, `race: ['Warrior']` — because the
 * question a consumer asks is "what can fetch this card", and that question is
 * answered with a `where` clause, not with a list of adjectives.
 *
 * Konami's verbatim phrase is kept alongside as `label`, so the UI renders what
 * was printed rather than reconstructing prose from columns.
 *
 * Everything here is driven by the token stream, so `"Elemental HERO Sunrise"`
 * is a single opaque token and its internal words — "HERO" is an archetype,
 * "Sunrise" is not — cannot leak into the filter.
 */

import type { IToken } from 'chevrotain';
import { Destination, Zone } from './ast';
import type {
  CardFilter,
  Destination as DestinationType,
  ParserContext,
  Quantity,
  TargetSubject,
  Zone as ZoneType,
  ZoneOwner,
  ZoneRef,
} from './ast';
import { hintOf, NumberLiteral, QuotedName, tokenFor } from './lexer';
import { TokenKind } from './lexicon';

const Stat = tokenFor(TokenKind.STAT);
const Comparator = tokenFor(TokenKind.COMPARATOR);
const Attribute = tokenFor(TokenKind.ATTRIBUTE);
const Position = tokenFor(TokenKind.POSITION);
const Owner = tokenFor(TokenKind.OWNER);
const ZoneTok = tokenFor(TokenKind.ZONE);
const Quantifier = tokenFor(TokenKind.QUANTIFIER);
const Except = tokenFor(TokenKind.EXCEPT);

/** Strip the surrounding quotes from a `QuotedName` image. */
export function unquote(image: string): string {
  return image.replace(/^"|"$/g, '');
}

/**
 * Common nouns that say what KIND of card, as opposed to which one.
 *
 * Their presence is what distinguishes `1 "HERO" monster` (a family) from
 * `1 "Dark Magician"` (one card), which is the difference between a `criteria`
 * subject and a `named` one.
 */
const CARD_TYPE_WORDS: ReadonlyMap<string, string[]> = new Map([
  ['monster', ['MONSTER']],
  ['monsters', ['MONSTER']],
  ['spell', ['SPELL']],
  ['spells', ['SPELL']],
  ['trap', ['TRAP']],
  ['traps', ['TRAP']],
]);

/** A generic noun that constrains nothing but marks a family rather than a name. */
const GENERIC_NOUNS = new Set([
  'card',
  'cards',
  'monster',
  'monsters',
  'spell',
  'spells',
  'trap',
  'traps',
]);

/** Summon classes, which live in their own column rather than in frameType. */
const SUMMON_TYPE_WORDS: ReadonlyMap<string, string> = new Map([
  ['fusion', 'FUSION'],
  ['synchro', 'SYNCHRO'],
  ['xyz', 'XYZ'],
  ['link', 'LINK'],
  ['ritual', 'RITUAL'],
]);

const SPELL_TRAP_SUBTYPE_WORDS: ReadonlyMap<string, string> = new Map([
  ['continuous', 'CONTINUOUS'],
  ['quick-play', 'QUICK_PLAY'],
  ['equip', 'EQUIP'],
  ['field', 'FIELD'],
  ['counter', 'COUNTER'],
]);

/** Which stat a comparator applies to, by the stat token's hint. */
const STAT_FIELDS: ReadonlyMap<string, [keyof CardFilter, keyof CardFilter]> =
  new Map([
    // [minField, maxField]
    ['level', ['levelMin', 'levelMax']],
    ['rank', ['levelMin', 'levelMax']],
    ['link', ['linkValMin', 'linkValMax']],
    ['atk', ['atkMin', 'atkMax']],
    ['def', ['defMin', 'defMax']],
  ]);

/**
 * Read the quantity from a noun phrase.
 *
 * "any number of" and "as many as possible" become `'any'` rather than a
 * guessed bound, and "up to 2" becomes `{ min: 0, max: 2 }` because the player
 * may choose fewer — including none.
 */
export function readQuantity(tokens: IToken[]): Quantity {
  const quantifier = tokens.find((t) => t.tokenType === Quantifier);
  const quantifierHint = quantifier ? hintOf(quantifier) : undefined;

  if (quantifierHint === 'any' || quantifierHint === 'all') return 'any';

  const number = tokens.find((t) => t.tokenType === NumberLiteral);

  if (quantifierHint === 'up_to') {
    const max = number ? Number(number.image) : 1;
    return { min: 0, max };
  }

  if (quantifierHint === 'one' && !number) return { min: 1, max: 1 };

  if (!number) return { min: 1, max: 1 };

  // A number that belongs to a stat is a value, not a count: in "1500 or less
  // ATK" the 1500 is the threshold. Only a leading count is a quantity.
  const numberIndex = tokens.indexOf(number);
  const statIndex = tokens.findIndex((t) => t.tokenType === Stat);
  if (statIndex !== -1 && Math.abs(statIndex - numberIndex) <= 1) {
    return { min: 1, max: 1 };
  }

  const value = Number(number.image);
  return { min: value, max: value };
}

/** The owner named in a phrase, defaulting to the controller. */
export function readOwner(tokens: IToken[]): ZoneOwner {
  const owner = tokens.find((t) => t.tokenType === Owner);
  const hint = owner ? hintOf(owner) : undefined;
  if (hint === 'opponent') return 'opponent';
  if (hint === 'either') return 'either';
  return 'self';
}

/** Every zone named in a phrase, in order, with its owner. */
export function readZones(tokens: IToken[]): ZoneRef[] {
  const owner = readOwner(tokens);
  const zones: ZoneRef[] = [];

  for (const token of tokens) {
    if (token.tokenType !== ZoneTok) continue;
    const hint = hintOf(token);
    if (!hint) continue;
    const zone = Object.values(Zone).find((z) => z === hint);
    if (!zone) continue;
    // "your hand or Deck" names two zones under one owner; a repeated zone is
    // not meaningful, so collapse duplicates.
    if (zones.some((z) => z.zone === zone && z.owner === owner)) continue;
    zones.push({ zone, owner });
  }

  // "you control" and "your opponent controls" name no zone word but mean the
  // field. Without this, "1 card your opponent controls" records whose card it
  // is nowhere at all, and the owner — the whole point of the phrase — is lost.
  if (zones.length === 0) {
    const controls = tokens.some(
      (t) => t.tokenType === Owner && /controls?$/i.test(t.image),
    );
    if (controls) zones.push({ zone: Zone.FIELD, owner });
  }

  return zones;
}

/**
 * Map a `to <zone>` phrase onto a destination.
 *
 * Face-up versus face-down is the Summon/Set distinction and comes from the
 * verb rather than the zone, so this returns the face-up field variant and the
 * visitor overrides it for `set`.
 */
export function readDestination(tokens: IToken[]): DestinationType | undefined {
  const zones = readZones(tokens);
  const zone: ZoneType | undefined = zones[0]?.zone;
  const hasFaceDown = tokens.some(
    (t) => t.tokenType === Position && hintOf(t) === 'face-down',
  );

  switch (zone) {
    case Zone.HAND:
      return Destination.HAND;
    case Zone.GY:
      return Destination.GY;
    case Zone.BANISHED:
      return Destination.BANISHED;
    case Zone.DECK:
      return Destination.DECK;
    case Zone.EXTRA_DECK:
      return Destination.EXTRA_DECK;
    case Zone.PENDULUM_ZONE:
      return Destination.PENDULUM_ZONE;
    case Zone.FIELD:
    case Zone.MONSTER_ZONE:
    case Zone.ST_ZONE:
    case Zone.FIELD_ZONE:
      return hasFaceDown
        ? Destination.FIELD_FACE_DOWN
        : Destination.FIELD_FACE_UP;
    default:
      return undefined;
  }
}

/** Apply a numeric bound to the right pair of filter columns. */
function applyStatBound(
  filter: CardFilter,
  statHint: string,
  value: number,
  comparator: string | undefined,
): void {
  const fields = STAT_FIELDS.get(statHint);
  if (!fields) return;
  const [minField, maxField] = fields;

  if (comparator === 'or_less') {
    (filter[maxField] as number) = value;
    return;
  }
  if (comparator === 'or_more') {
    (filter[minField] as number) = value;
    return;
  }
  // No comparator: an exact value, which is a closed range.
  (filter[minField] as number) = value;
  (filter[maxField] as number) = value;
}

/**
 * Read stat constraints, which appear in both printed orders:
 *
 *     Level 4 or lower monster        Stat Number Comparator
 *     monster with 1500 or less ATK   Number Comparator Stat
 */
function readStatBounds(tokens: IToken[], filter: CardFilter): void {
  tokens.forEach((token, i) => {
    if (token.tokenType !== Stat) return;
    const statHint = hintOf(token);
    if (!statHint || !STAT_FIELDS.has(statHint)) return;

    // The number is adjacent on one side or the other.
    const after = tokens[i + 1];
    const before = tokens[i - 1];
    let numberToken: IToken | undefined;
    let comparatorToken: IToken | undefined;

    if (after?.tokenType === NumberLiteral) {
      numberToken = after;
      comparatorToken =
        tokens[i + 2]?.tokenType === Comparator ? tokens[i + 2] : undefined;
    } else if (before?.tokenType === NumberLiteral) {
      numberToken = before;
      comparatorToken =
        tokens[i - 2]?.tokenType === Comparator
          ? tokens[i - 2]
          : // "1500 or less ATK" puts the comparator between number and stat.
            tokens[i - 1]?.tokenType === Comparator
            ? tokens[i - 1]
            : undefined;
    }

    // "1500 or less ATK": number, comparator, stat.
    if (!numberToken && before?.tokenType === Comparator) {
      const twoBack = tokens[i - 2];
      if (twoBack?.tokenType === NumberLiteral) {
        numberToken = twoBack;
        comparatorToken = before;
      }
    }

    if (!numberToken) return;
    applyStatBound(
      filter,
      statHint,
      Number(numberToken.image),
      comparatorToken ? hintOf(comparatorToken) : undefined,
    );
  });
}

/** Names carved out by an `except "X"` clause. */
export function readExceptNames(tokens: IToken[]): string[] {
  const exceptAt = tokens.findIndex((t) => t.tokenType === Except);
  if (exceptAt === -1) return [];

  return tokens
    .slice(exceptAt + 1)
    .filter((t) => t.tokenType === QuotedName)
    .map((t) => unquote(t.image));
}

/**
 * Turn a noun phrase into a filter.
 *
 * Only constraints the text actually states are set. An absent field means "not
 * constrained", never "zero" — which is why there is no default level or ATK.
 */
export function readFilter(tokens: IToken[], ctx: ParserContext): CardFilter {
  const filter: CardFilter = {};

  // Quoted tokens: an exact archetype when the pool knows it, otherwise a
  // name-substring match. Validating against the DB's own vocabulary is what
  // keeps "HERO" an archetype and a one-off quoted word a substring.
  const quoted = tokens.filter((t) => t.tokenType === QuotedName);
  const exceptNames = new Set(readExceptNames(tokens));
  for (const token of quoted) {
    const name = unquote(token.image);
    if (exceptNames.has(name)) continue;
    if (ctx.archetypes.has(name)) {
      filter.archetype = name;
    } else if (!filter.archetype && !filter.nameContains) {
      filter.nameContains = name;
    }
  }

  if (exceptNames.size) filter.excludeNames = [...exceptNames];

  for (const token of tokens) {
    if (token.tokenType === Attribute) {
      const hint = hintOf(token);
      if (hint) filter.attribute = [...(filter.attribute ?? []), hint];
      continue;
    }

    if (token.tokenType === Position) {
      const hint = hintOf(token);
      if (hint === 'face-up' || hint === 'face-down') filter.position = hint;
      continue;
    }

    const word = token.image.toLowerCase();

    const cardType = CARD_TYPE_WORDS.get(word);
    if (cardType) {
      filter.cardType = cardType;
      continue;
    }

    const summonType = SUMMON_TYPE_WORDS.get(word);
    if (summonType) {
      filter.summonType = [...(filter.summonType ?? []), summonType];
      continue;
    }

    // A monster Type ("Warrior", "Dragon") is validated against the pool's own
    // vocabulary rather than a hardcoded list, so a new Type needs no change
    // here. Capitalisation in print is inconsistent, so match case-insensitively.
    const race = [...ctx.races].find((r) => r.toLowerCase() === word);
    if (race) {
      filter.race = [...(filter.race ?? []), race];
      continue;
    }

    if (word === 'tuner') filter.isTuner = true;
    else if (word === 'pendulum') filter.isPendulum = true;
    else if (word === 'effect') filter.isEffect = true;
  }

  // A Spell/Trap subtype word only means a subtype when the phrase is about a
  // Spell or Trap — "Field" is also a zone, and "Continuous" also an effect
  // category.
  if (filter.cardType?.some((t) => t === 'SPELL' || t === 'TRAP')) {
    for (const token of tokens) {
      const subType = SPELL_TRAP_SUBTYPE_WORDS.get(token.image.toLowerCase());
      if (subType) {
        filter.spellTrapSubType = [...(filter.spellTrapSubType ?? []), subType];
      }
    }
  }

  readStatBounds(tokens, filter);

  return filter;
}

/** True when a filter constrains at least one column. */
export function isConstrained(filter: CardFilter): boolean {
  return Object.keys(filter).some(
    (key) =>
      key !== 'excludeNames' && filter[key as keyof CardFilter] !== undefined,
  );
}

/** Verbatim text of a token run, for a node's `label`. */
export function labelOf(tokens: IToken[]): string {
  return tokens
    .map((t) => t.image)
    .join(' ')
    .replace(/\s+([.,;:)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim();
}

/**
 * Decide what a noun phrase refers to.
 *
 * The `named` / `criteria` split is the one judgement that matters here. A
 * quoted token that the pool does not know as an archetype, with no generic
 * noun after it, names ONE card: `Special Summon 1 "Dark Magician"`. The same
 * quoted token followed by "monster" names a family: `add 1 "HERO" monster`.
 * Getting this backwards would either lose a whole archetype's worth of
 * reachability or invent a card that does not exist.
 *
 * When nothing in the phrase constrains anything, the result is `unresolved`
 * rather than an empty `criteria`. An empty filter matches every card in the
 * game, so persisting one would claim the card can fetch anything — the exact
 * kind of wrong fact that costs more than a missing one.
 */
export function readSubject(
  tokens: IToken[],
  ctx: ParserContext,
): TargetSubject {
  const label = labelOf(tokens);
  if (tokens.length === 0) return { kind: 'unresolved', text: '' };

  // "this card" is lexed as a Reference, so a phrase naming the card itself
  // only reaches here when it was spelled out.
  if (ctx.cardName && label.includes(ctx.cardName)) return { kind: 'self' };

  const quoted = tokens.filter((t) => t.tokenType === QuotedName);
  const exceptNames = new Set(readExceptNames(tokens));
  const subjectNames = quoted
    .map((t) => unquote(t.image))
    .filter((n) => !exceptNames.has(n));

  const hasGenericNoun = tokens.some((t) =>
    GENERIC_NOUNS.has(t.image.toLowerCase()),
  );
  const unknownNames = subjectNames.filter((n) => !ctx.archetypes.has(n));

  if (unknownNames.length && !hasGenericNoun) {
    return { kind: 'named', names: unknownNames };
  }

  const filter = readFilter(tokens, ctx);
  if (isConstrained(filter)) {
    return { kind: 'criteria', filter, label };
  }

  return { kind: 'unresolved', text: label };
}
