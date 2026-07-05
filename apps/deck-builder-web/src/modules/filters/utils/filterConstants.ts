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
export type FrameType = typeof FRAME_TYPES[number]

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

// Lowercase link-arrow keys matching the LinkLevelIcon geometry and the DB casing.
export const LINK_MARKERS = [
  'top-left', 'top', 'top-right',
  'left', 'right',
  'bottom-left', 'bottom', 'bottom-right',
] as const
export type LinkMarker = typeof LINK_MARKERS[number]

export const LINK_MARKER_LABELS: Record<LinkMarker, string> = {
  'top-left': 'Top-Left',
  top: 'Top',
  'top-right': 'Top-Right',
  left: 'Left',
  right: 'Right',
  'bottom-left': 'Bottom-Left',
  bottom: 'Bottom',
  'bottom-right': 'Bottom-Right',
}
