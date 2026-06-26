'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useFilterStoreBase } from '@/modules/filters/hooks/useFilterStore/useFilterStore'
import type { FilterState, SortField, SortDirection } from '@/modules/filters/hooks/useFilterStore/useFilterStore'
import type {
  CardsControllerFindAllCardTypeItem,
  CardsControllerFindAllFrameTypeItem,
  CardsControllerFindAllBanStatusTcgItem,
} from '@/generated/model'

function toURLParams(state: FilterState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.search) params.set('q', state.search)
  state.cardTypes.forEach((t) => params.append('cardType', t))
  state.frameTypes.forEach((t) => params.append('frameType', t))
  state.attributes.forEach((a) => params.append('attribute', a))
  state.banStatuses.forEach((b) => params.append('banStatusTcg', b))
  if (state.levelMin !== undefined) params.set('levelMin', String(state.levelMin))
  if (state.levelMax !== undefined) params.set('levelMax', String(state.levelMax))
  if (state.atkMin !== undefined) params.set('atkMin', String(state.atkMin))
  if (state.atkMax !== undefined) params.set('atkMax', String(state.atkMax))
  if (state.defMin !== undefined) params.set('defMin', String(state.defMin))
  if (state.defMax !== undefined) params.set('defMax', String(state.defMax))
  if (state.sortField !== 'name') params.set('sortField', state.sortField)
  if (state.sortDirection !== 'asc') params.set('sortDirection', state.sortDirection)
  return params
}

export function useFilterSync() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const store = useFilterStoreBase.getState()

    // Hydrate store from URL params (runs once on mount, before subscribe)
    const q = searchParams.get('q')
    const cardTypes = searchParams.getAll('cardType') as CardsControllerFindAllCardTypeItem[]
    const frameTypes = searchParams.getAll('frameType') as CardsControllerFindAllFrameTypeItem[]
    const attributes = searchParams.getAll('attribute')
    const banStatuses = searchParams.getAll('banStatusTcg') as CardsControllerFindAllBanStatusTcgItem[]
    const levelMin = searchParams.get('levelMin')
    const levelMax = searchParams.get('levelMax')
    const atkMin = searchParams.get('atkMin')
    const atkMax = searchParams.get('atkMax')
    const defMin = searchParams.get('defMin')
    const defMax = searchParams.get('defMax')
    const sortField = searchParams.get('sortField') as SortField | null
    const sortDirection = searchParams.get('sortDirection') as SortDirection | null

    if (q) store.updateSearch(q)
    cardTypes.forEach((t) => store.toggleCardType(t))
    frameTypes.forEach((t) => store.toggleFrameType(t))
    attributes.forEach((a) => store.toggleAttribute(a))
    banStatuses.forEach((b) => store.toggleBanStatus(b))
    if (levelMin !== null || levelMax !== null)
      store.setLevelRange(
        levelMin !== null ? Number(levelMin) : undefined,
        levelMax !== null ? Number(levelMax) : undefined,
      )
    if (atkMin !== null || atkMax !== null)
      store.setAtkRange(
        atkMin !== null ? Number(atkMin) : undefined,
        atkMax !== null ? Number(atkMax) : undefined,
      )
    if (defMin !== null || defMax !== null)
      store.setDefRange(
        defMin !== null ? Number(defMin) : undefined,
        defMax !== null ? Number(defMax) : undefined,
      )
    if (sortField) store.setSort(sortField, sortDirection ?? 'asc')

    // Subscribe to all future store changes and push URL.
    // Set up after hydration so the hydration writes above don't trigger it.
    const unsubscribe = useFilterStoreBase.subscribe((state) => {
      const qs = toURLParams(state).toString()
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
    })

    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
