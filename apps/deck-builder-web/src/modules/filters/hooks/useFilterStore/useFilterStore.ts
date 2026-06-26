import { create } from 'zustand'
import { createSelectors } from '@/modules/common/utils/store'
import type {
  CardsControllerFindAllParams,
  CardsControllerFindAllCardTypeItem,
  CardsControllerFindAllFrameTypeItem,
  CardsControllerFindAllBanStatusTcgItem,
} from '@/generated/model'

type SortField = 'name' | 'atk' | 'def' | 'level'
type SortDirection = 'asc' | 'desc'

interface FilterState {
  search: string
  cardTypes: CardsControllerFindAllCardTypeItem[]
  frameTypes: CardsControllerFindAllFrameTypeItem[]
  attributes: string[]
  banStatuses: CardsControllerFindAllBanStatusTcgItem[]
  levelMin: number | undefined
  levelMax: number | undefined
  atkMin: number | undefined
  atkMax: number | undefined
  defMin: number | undefined
  defMax: number | undefined
  sortField: SortField
  sortDirection: SortDirection

  updateSearch: (search: string) => void
  toggleCardType: (type: CardsControllerFindAllCardTypeItem) => void
  toggleFrameType: (type: CardsControllerFindAllFrameTypeItem) => void
  toggleAttribute: (attr: string) => void
  toggleBanStatus: (status: CardsControllerFindAllBanStatusTcgItem) => void
  setLevelRange: (min: number | undefined, max: number | undefined) => void
  setAtkRange: (min: number | undefined, max: number | undefined) => void
  setDefRange: (min: number | undefined, max: number | undefined) => void
  setSort: (field: SortField, direction: SortDirection) => void
  removeFilter: (type: string, value?: string) => void
  clearAll: () => void
  getActiveFilterCount: () => number
  toQueryParams: () => CardsControllerFindAllParams
}

const initialState = {
  search: '',
  cardTypes: [] as CardsControllerFindAllCardTypeItem[],
  frameTypes: [] as CardsControllerFindAllFrameTypeItem[],
  attributes: [] as string[],
  banStatuses: [] as CardsControllerFindAllBanStatusTcgItem[],
  levelMin: undefined as number | undefined,
  levelMax: undefined as number | undefined,
  atkMin: undefined as number | undefined,
  atkMax: undefined as number | undefined,
  defMin: undefined as number | undefined,
  defMax: undefined as number | undefined,
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
    set((s) => ({
      frameTypes: s.frameTypes.includes(type)
        ? s.frameTypes.filter((t) => t !== type)
        : [...s.frameTypes, type],
    })),

  toggleAttribute: (attr) =>
    set((s) => ({
      attributes: s.attributes.includes(attr)
        ? s.attributes.filter((a) => a !== attr)
        : [...s.attributes, attr],
    })),

  toggleBanStatus: (status) =>
    set((s) => ({
      banStatuses: s.banStatuses.includes(status)
        ? s.banStatuses.filter((b) => b !== status)
        : [...s.banStatuses, status],
    })),

  setLevelRange: (min, max) => set({ levelMin: min, levelMax: max }),
  setAtkRange: (min, max) => set({ atkMin: min, atkMax: max }),
  setDefRange: (min, max) => set({ defMin: min, defMax: max }),

  setSort: (field, direction) => set({ sortField: field, sortDirection: direction }),

  removeFilter: (type, value) =>
    set((s) => {
      switch (type) {
        case 'search': return { search: '' }
        case 'cardType': return { cardTypes: s.cardTypes.filter((t) => t !== value) }
        case 'frameType': return { frameTypes: s.frameTypes.filter((t) => t !== value) }
        case 'attribute': return { attributes: s.attributes.filter((a) => a !== value) }
        case 'banStatus': return { banStatuses: s.banStatuses.filter((b) => b !== value) }
        case 'levelRange': return { levelMin: undefined, levelMax: undefined }
        case 'atkRange': return { atkMin: undefined, atkMax: undefined }
        case 'defRange': return { defMin: undefined, defMax: undefined }
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
    count += s.banStatuses.length
    if (s.levelMin !== undefined || s.levelMax !== undefined) count++
    if (s.atkMin !== undefined || s.atkMax !== undefined) count++
    if (s.defMin !== undefined || s.defMax !== undefined) count++
    return count
  },

  toQueryParams: (): CardsControllerFindAllParams => {
    const s = get()
    const params: CardsControllerFindAllParams = {}
    if (s.search) params.q = s.search
    if (s.cardTypes.length) params.cardType = s.cardTypes
    if (s.frameTypes.length) params.frameType = s.frameTypes
    if (s.attributes.length) params.attribute = s.attributes
    if (s.banStatuses.length) params.banStatusTcg = s.banStatuses
    if (s.levelMin !== undefined) params.levelMin = s.levelMin
    if (s.levelMax !== undefined) params.levelMax = s.levelMax
    if (s.atkMin !== undefined) params.atkMin = s.atkMin
    if (s.atkMax !== undefined) params.atkMax = s.atkMax
    if (s.defMin !== undefined) params.defMin = s.defMin
    if (s.defMax !== undefined) params.defMax = s.defMax
    return params
  },
}))

export const useFilterStore = createSelectors(useFilterStoreBase)
export type { FilterState, SortField, SortDirection }
