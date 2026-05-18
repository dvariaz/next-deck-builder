import {
  BanStatus,
  CardFrameType,
  CardType,
  MonsterEffectType,
  Prisma,
  SpellTrapSubType,
  SummonType,
} from '../../../generated/prisma/client';
import { YgoApiCard } from './types';

const SPELL_TRAP_RACE_MAP: Record<string, SpellTrapSubType> = {
  Normal: SpellTrapSubType.NORMAL,
  Continuous: SpellTrapSubType.CONTINUOUS,
  'Quick-Play': SpellTrapSubType.QUICK_PLAY,
  Equip: SpellTrapSubType.EQUIP,
  Field: SpellTrapSubType.FIELD,
  Ritual: SpellTrapSubType.RITUAL,
  Counter: SpellTrapSubType.COUNTER,
};

const FRAME_TYPE_MAP: Record<string, CardFrameType> = {
  normal: CardFrameType.NORMAL,
  effect: CardFrameType.EFFECT,
  ritual: CardFrameType.RITUAL,
  fusion: CardFrameType.FUSION,
  synchro: CardFrameType.SYNCHRO,
  xyz: CardFrameType.XYZ,
  link: CardFrameType.LINK,
  token: CardFrameType.TOKEN,
  effect_pendulum: CardFrameType.PENDULUM,
  normal_pendulum: CardFrameType.PENDULUM,
  fusion_pendulum: CardFrameType.PENDULUM,
  xyz_pendulum: CardFrameType.PENDULUM,
  synchro_pendulum: CardFrameType.PENDULUM,
  ritual_pendulum: CardFrameType.PENDULUM,
  spell: CardFrameType.NORMAL,
  trap: CardFrameType.NORMAL,
};

const BAN_STATUS_MAP: Record<string, BanStatus> = {
  Forbidden: BanStatus.FORBIDDEN,
  Limited: BanStatus.LIMITED,
  'Semi-Limited': BanStatus.SEMI_LIMITED,
};

function isMonster(card: YgoApiCard): boolean {
  return (
    !card.type.includes('Spell') &&
    !card.type.includes('Trap') &&
    card.frameType !== 'skill'
  );
}

function mapCardType(card: YgoApiCard): CardType {
  if (card.type.includes('Spell')) return CardType.SPELL;
  if (card.type.includes('Trap')) return CardType.TRAP;
  return CardType.MONSTER;
}

function mapFrameType(card: YgoApiCard): CardFrameType {
  return FRAME_TYPE_MAP[card.frameType] ?? CardFrameType.NORMAL;
}

function mapSummonType(card: YgoApiCard): SummonType | null {
  if (!isMonster(card) || card.type === 'Token' || card.frameType === 'token') {
    return null;
  }

  const { type } = card;
  if (type.includes('Link')) return SummonType.LINK;
  if (type.includes('XYZ') || type.includes('Xyz')) return SummonType.XYZ;
  if (type.includes('Synchro')) return SummonType.SYNCHRO;
  if (type.includes('Fusion')) return SummonType.FUSION;
  if (type.includes('Ritual')) return SummonType.RITUAL;

  return SummonType.NORMAL;
}

function mapMonsterEffectType(card: YgoApiCard): MonsterEffectType | null {
  if (!isMonster(card) || card.type === 'Token') {
    return null;
  }

  const { type, typeline = [] } = card;

  if (type.includes('Flip') || typeline.includes('Flip')) {
    return MonsterEffectType.FLIP;
  }

  if (
    type === 'Normal Monster' ||
    type === 'Pendulum Normal Monster' ||
    type === 'Normal Tuner Monster' ||
    typeline.includes('Normal')
  ) {
    return MonsterEffectType.NORMAL;
  }

  if (
    type.includes('Effect') ||
    type.includes('Gemini') ||
    type.includes('Spirit') ||
    type.includes('Union') ||
    type.includes('Toon') ||
    typeline.includes('Effect')
  ) {
    return MonsterEffectType.EFFECT;
  }

  return null;
}

function mapSpellTrapSubType(card: YgoApiCard): SpellTrapSubType | null {
  if (!card.type.includes('Spell') && !card.type.includes('Trap')) {
    return null;
  }

  return SPELL_TRAP_RACE_MAP[card.race] ?? SpellTrapSubType.NORMAL;
}

function mapBanStatus(value?: string): BanStatus | null {
  if (!value) return null;
  return BAN_STATUS_MAP[value] ?? null;
}

export function shouldSkipCard(card: YgoApiCard): boolean {
  return card.frameType === 'skill' || card.type === 'Skill Card';
}

export function mapApiCardToCreateInput(
  card: YgoApiCard,
): Prisma.CardCreateManyInput {
  const typeline = card.typeline ?? [];
  const monster = isMonster(card);

  return {
    ygoId: card.id,
    name: card.name,
    cardType: mapCardType(card),
    frameType: mapFrameType(card),
    description: card.desc,
    archetype: card.archetype ?? null,
    ygoprodeckUrl: card.ygoprodeck_url ?? null,
    banStatusTcg: mapBanStatus(card.banlist_info?.ban_tcg),
    banStatusOcg: mapBanStatus(card.banlist_info?.ban_ocg),
    atk: monster ? (card.atk ?? null) : null,
    def: monster ? (card.def ?? null) : null,
    level: monster ? (card.level ?? null) : null,
    linkVal: monster ? (card.linkval ?? null) : null,
    scale: monster ? (card.scale ?? null) : null,
    attribute: monster ? (card.attribute ?? null) : null,
    race: monster ? (card.race ?? null) : null,
    summonType: mapSummonType(card),
    monsterEffectType: mapMonsterEffectType(card),
    spellTrapSubType: mapSpellTrapSubType(card),
    isEffect: typeline.includes('Effect') || card.type.includes('Effect'),
    isFlip: typeline.includes('Flip') || card.type.includes('Flip'),
    isTuner: typeline.includes('Tuner') || card.type.includes('Tuner'),
    isPendulum:
      card.frameType.includes('pendulum') || typeline.includes('Pendulum'),
    isToken: card.frameType === 'token' || card.type === 'Token',
  };
}

export function mapCardSets(
  cardId: number,
  card: YgoApiCard,
): Prisma.CardSetCreateManyInput[] {
  return (card.card_sets ?? []).map((set) => ({
    cardId,
    setName: set.set_name,
    setCode: set.set_code,
    setRarity: set.set_rarity,
    setRarityCode: set.set_rarity_code,
  }));
}

export function mapCardImages(
  cardId: number,
  card: YgoApiCard,
): Prisma.CardImageCreateManyInput[] {
  return (card.card_images ?? []).map((image) => ({
    cardId,
    imageUrl: image.image_url,
    imageUrlSmall: image.image_url_small,
    imageUrlCropped: image.image_url_cropped,
  }));
}
