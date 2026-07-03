import { create } from 'zustand'
import { createSelectors } from '@/modules/common/utils/store'
import { CardsControllerFindAllCardTypeItem } from '@/generated/model'
import type {
  CardsControllerFindAllParams,
  CardsControllerFindAllFrameTypeItem,
  CardsControllerFindAllBanStatusTcgItem,
  CardsControllerFindAllSpellTrapSubTypeItem,
} from '@/generated/model'

type SortField = 'name' | 'atk' | 'def' | 'level'
type SortDirection = 'asc' | 'desc'

interface FilterState {
  search: string
  cardTypes: CardsControllerFindAllCardTypeItem[]
  frameTypes: CardsControllerFindAllFrameTypeItem[]
  attributes: string[]
  races: string[]
  spellTrapSubTypes: CardsControllerFindAllSpellTrapSubTypeItem[]
  banStatuses: CardsControllerFindAllBanStatusTcgItem[]
  levelMin: number | undefined
  levelMax: number | undefined
  atkMin: number | undefined
  atkMax: number | undefined
  defMin: number | undefined
  defMax: number | undefined
  isTuner: boolean | undefined
  isFlip: boolean | undefined
  isPendulum: boolean | undefined
  sortField: SortField
  sortDirection: SortDirection

  updateSearch: (search: string) => void
  toggleCardType: (type: CardsControllerFindAllCardTypeItem) => void
  toggleFrameType: (type: CardsControllerFindAllFrameTypeItem) => void
  toggleAttribute: (attr: string) => void
  toggleRace: (race: string) => void
  toggleSpellTrapSubType: (type: CardsControllerFindAllSpellTrapSubTypeItem) => void
  toggleBanStatus: (status: CardsControllerFindAllBanStatusTcgItem) => void
  setLevelRange: (min: number | undefined, max: number | undefined) => void
  setAtkRange: (min: number | undefined, max: number | undefined) => void
  setDefRange: (min: number | undefined, max: number | undefined) => void
  setIsTuner: (val: boolean | undefined) => void
  setIsFlip: (val: boolean | undefined) => void
  setIsPendulum: (val: boolean | undefined) => void
  setSort: (field: SortField, direction: SortDirection) => void
  removeFilter: (type: string, value?: string) => void
  clearAll: () => void
  getActiveFilterCount: () => number
  toQueryParams: () => CardsControllerFindAllParams
}

const { MONSTER, SPELL, TRAP } = CardsControllerFindAllCardTypeItem

const SPELL_TRAP_SUB_TYPE_IMPLIED_CARD_TYPES: Record<
  CardsControllerFindAllSpellTrapSubTypeItem,
  CardsControllerFindAllCardTypeItem[]
> = {
  NORMAL: [SPELL, TRAP],
  CONTINUOUS: [SPELL, TRAP],
  QUICK_PLAY: [SPELL],
  EQUIP: [SPELL],
  FIELD: [SPELL],
  RITUAL: [SPELL],
  COUNTER: [TRAP],
}

// Only auto-fills cardTypes when no card type has been explicitly chosen yet.
function withImpliedCardTypes(
  current: CardsControllerFindAllCardTypeItem[],
  implied: CardsControllerFindAllCardTypeItem[],
) {
  return current.length === 0 ? implied : current
}

const initialState = {
  search: '',
  cardTypes: [] as CardsControllerFindAllCardTypeItem[],
  frameTypes: [] as CardsControllerFindAllFrameTypeItem[],
  attributes: [] as string[],
  races: [] as string[],
  spellTrapSubTypes: [] as CardsControllerFindAllSpellTrapSubTypeItem[],
  banStatuses: [] as CardsControllerFindAllBanStatusTcgItem[],
  levelMin: undefined as number | undefined,
  levelMax: undefined as number | undefined,
  atkMin: undefined as number | undefined,
  atkMax: undefined as number | undefined,
  defMin: undefined as number | undefined,
  defMax: undefined as number | undefined,
  isTuner: undefined as boolean | undefined,
  isFlip: undefined as boolean | undefined,
  isPendulum: undefined as boolean | undefined,
  sortField: 'name' as SortField,
  sortDirection: 'asc' as SortDirection,
}

export const useFilterStoreBase = create<FilterState>()((set, get) => ({
  ...initialState,

  updateSearch: (search) => set({ search }),

  toggleCardType: (type) =>
    set((s) => ({
      cardTypes: s.cardTypes.includes(type)
        ? s.cardTypes.filter((t) => t !== type)
        : [...s.cardTypes, type],
    })),

  toggleFrameType: (type) =>
    set((s) => {
      const isAdding = !s.frameTypes.includes(type)
      return {
        frameTypes: isAdding ? [...s.frameTypes, type] : s.frameTypes.filter((t) => t !== type),
        cardTypes: isAdding ? withImpliedCardTypes(s.cardTypes, [MONSTER]) : s.cardTypes,
      }
    }),

  toggleAttribute: (attr) =>
    set((s) => {
      const isAdding = !s.attributes.includes(attr)
      return {
        attributes: isAdding ? [...s.attributes, attr] : s.attributes.filter((a) => a !== attr),
        cardTypes: isAdding ? withImpliedCardTypes(s.cardTypes, [MONSTER]) : s.cardTypes,
      }
    }),

  toggleRace: (race) =>
    set((s) => {
      const isAdding = !s.races.includes(race)
      return {
        races: isAdding ? [...s.races, race] : s.races.filter((r) => r !== race),
        cardTypes: isAdding ? withImpliedCardTypes(s.cardTypes, [MONSTER]) : s.cardTypes,
      }
    }),

  toggleSpellTrapSubType: (type) =>
    set((s) => {
      const isAdding = !s.spellTrapSubTypes.includes(type)
      return {
        spellTrapSubTypes: isAdding
          ? [...s.spellTrapSubTypes, type]
          : s.spellTrapSubTypes.filter((t) => t !== type),
        cardTypes: isAdding
          ? withImpliedCardTypes(s.cardTypes, SPELL_TRAP_SUB_TYPE_IMPLIED_CARD_TYPES[type])
          : s.cardTypes,
      }
    }),

  toggleBanStatus: (status) =>
    set((s) => ({
      banStatuses: s.banStatuses.includes(status)
        ? s.banStatuses.filter((b) => b !== status)
        : [...s.banStatuses, status],
    })),

  setLevelRange: (min, max) =>
    set((s) => ({
      levelMin: min,
      levelMax: max,
      cardTypes: min !== undefined || max !== undefined
        ? withImpliedCardTypes(s.cardTypes, [MONSTER])
        : s.cardTypes,
    })),
  setAtkRange: (min, max) =>
    set((s) => ({
      atkMin: min,
      atkMax: max,
      cardTypes: min !== undefined || max !== undefined
        ? withImpliedCardTypes(s.cardTypes, [MONSTER])
        : s.cardTypes,
    })),
  setDefRange: (min, max) =>
    set((s) => ({
      defMin: min,
      defMax: max,
      cardTypes: min !== undefined || max !== undefined
        ? withImpliedCardTypes(s.cardTypes, [MONSTER])
        : s.cardTypes,
    })),
  setIsTuner: (val) =>
    set((s) => ({ isTuner: val, cardTypes: val ? withImpliedCardTypes(s.cardTypes, [MONSTER]) : s.cardTypes })),
  setIsFlip: (val) =>
    set((s) => ({ isFlip: val, cardTypes: val ? withImpliedCardTypes(s.cardTypes, [MONSTER]) : s.cardTypes })),
  setIsPendulum: (val) =>
    set((s) => ({ isPendulum: val, cardTypes: val ? withImpliedCardTypes(s.cardTypes, [MONSTER]) : s.cardTypes })),

  setSort: (field, direction) => set({ sortField: field, sortDirection: direction }),

  removeFilter: (type, value) =>
    set((s) => {
      switch (type) {
        case 'search': return { search: '' }
        case 'cardType': return { cardTypes: s.cardTypes.filter((t) => t !== value) }
        case 'frameType': return { frameTypes: s.frameTypes.filter((t) => t !== value) }
        case 'attribute': return { attributes: s.attributes.filter((a) => a !== value) }
        case 'race': return { races: s.races.filter((r) => r !== value) }
        case 'spellTrapSubType': return { spellTrapSubTypes: s.spellTrapSubTypes.filter((t) => t !== value) }
        case 'banStatus': return { banStatuses: s.banStatuses.filter((b) => b !== value) }
        case 'levelRange': return { levelMin: undefined, levelMax: undefined }
        case 'atkRange': return { atkMin: undefined, atkMax: undefined }
        case 'defRange': return { defMin: undefined, defMax: undefined }
        case 'isTuner': return { isTuner: undefined }
        case 'isFlip': return { isFlip: undefined }
        case 'isPendulum': return { isPendulum: undefined }
        default: return {}
      }
    }),

  clearAll: () => set(initialState),

  getActiveFilterCount: () => {
    const s = get()
    let count = 0
    if (s.search) count++
    count += s.cardTypes.length
    count += s.frameTypes.length
    count += s.attributes.length
    count += s.races.length
    count += s.spellTrapSubTypes.length
    count += s.banStatuses.length
    if (s.levelMin !== undefined || s.levelMax !== undefined) count++
    if (s.atkMin !== undefined || s.atkMax !== undefined) count++
    if (s.defMin !== undefined || s.defMax !== undefined) count++
    if (s.isTuner !== undefined) count++
    if (s.isFlip !== undefined) count++
    if (s.isPendulum !== undefined) count++
    return count
  },

  toQueryParams: (): CardsControllerFindAllParams => {
    const s = get()
    const params: CardsControllerFindAllParams = {}
    if (s.search) params.q = s.search
    if (s.cardTypes.length) params.cardType = s.cardTypes
    if (s.frameTypes.length) params.frameType = s.frameTypes
    if (s.attributes.length) params.attribute = s.attributes
    if (s.races.length) params.race = s.races
    if (s.spellTrapSubTypes.length) params.spellTrapSubType = s.spellTrapSubTypes
    if (s.banStatuses.length) params.banStatusTcg = s.banStatuses
    if (s.levelMin !== undefined) params.levelMin = s.levelMin
    if (s.levelMax !== undefined) params.levelMax = s.levelMax
    if (s.atkMin !== undefined) params.atkMin = s.atkMin
    if (s.atkMax !== undefined) params.atkMax = s.atkMax
    if (s.defMin !== undefined) params.defMin = s.defMin
    if (s.defMax !== undefined) params.defMax = s.defMax
    if (s.isTuner !== undefined) params.isTuner = s.isTuner
    if (s.isFlip !== undefined) params.isFlip = s.isFlip
    if (s.isPendulum !== undefined) params.isPendulum = s.isPendulum
    return params
  },
}))

export const useFilterStore = createSelectors(useFilterStoreBase)
export type { FilterState, SortField, SortDirection }
