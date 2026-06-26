import {
  CardsControllerFindAllFrameTypeItem,
  CardsControllerFindAllSpellTrapSubTypeItem,
} from '@/generated/model'

export const ATTRIBUTES = ['DARK', 'LIGHT', 'FIRE', 'WATER', 'EARTH', 'WIND', 'DIVINE'] as const
export type Attribute = typeof ATTRIBUTES[number]

export const FRAME_TYPES = [
  CardsControllerFindAllFrameTypeItem.NORMAL,
  CardsControllerFindAllFrameTypeItem.EFFECT,
  CardsControllerFindAllFrameTypeItem.FUSION,
  CardsControllerFindAllFrameTypeItem.SYNCHRO,
  CardsControllerFindAllFrameTypeItem.XYZ,
  CardsControllerFindAllFrameTypeItem.LINK,
  CardsControllerFindAllFrameTypeItem.RITUAL,
  CardsControllerFindAllFrameTypeItem.PENDULUM,
] as const

export const RACES = [
  'Dragon', 'Spellcaster', 'Warrior', 'Fiend', 'Zombie', 'Machine',
  'Aqua', 'Pyro', 'Rock', 'Sea Serpent', 'Thunder', 'Beast',
  'Beast-Warrior', 'Dinosaur', 'Insect', 'Fish', 'Reptile', 'Plant',
  'Winged Beast', 'Fairy', 'Psychic', 'Divine-Beast', 'Wyrm', 'Cyberse',
] as const

export const SPELL_TRAP_SUB_TYPES = [
  CardsControllerFindAllSpellTrapSubTypeItem.NORMAL,
  CardsControllerFindAllSpellTrapSubTypeItem.CONTINUOUS,
  CardsControllerFindAllSpellTrapSubTypeItem.QUICK_PLAY,
  CardsControllerFindAllSpellTrapSubTypeItem.EQUIP,
  CardsControllerFindAllSpellTrapSubTypeItem.FIELD,
  CardsControllerFindAllSpellTrapSubTypeItem.RITUAL,
  CardsControllerFindAllSpellTrapSubTypeItem.COUNTER,
] as const

export const SPELL_TRAP_SUB_TYPE_LABELS: Record<CardsControllerFindAllSpellTrapSubTypeItem, string> = {
  NORMAL: 'Normal',
  CONTINUOUS: 'Continuous',
  QUICK_PLAY: 'Quick-Play',
  EQUIP: 'Equip',
  FIELD: 'Field',
  RITUAL: 'Ritual',
  COUNTER: 'Counter',
}
