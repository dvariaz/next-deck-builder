'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useFilterStoreBase } from '@/modules/filters/hooks/useFilterStore/useFilterStore'
import type { FilterState, SortField, SortDirection } from '@/modules/filters/hooks/useFilterStore/useFilterStore'
import type {
  CardsControllerFindAllCardType,
  CardsControllerFindAllFrameType,
  CardsControllerFindAllBanStatusTcg,
} from '@/generated/model'

function toURLParams(state: FilterState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.search) params.set('name', state.search)
  if (state.cardTypes.length === 1) params.set('cardType', state.cardTypes[0])
  if (state.frameTypes.length === 1) params.set('frameType', state.frameTypes[0])
  if (state.attributes.length === 1) params.set('attribute', state.attributes[0])
  if (state.banStatus) params.set('banStatusTcg', state.banStatus)
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
    const name = searchParams.get('name')
    const cardType = searchParams.get('cardType') as CardsControllerFindAllCardType | null
    const frameType = searchParams.get('frameType') as CardsControllerFindAllFrameType | null
    const attribute = searchParams.get('attribute')
    const banStatusTcg = searchParams.get('banStatusTcg') as CardsControllerFindAllBanStatusTcg | null
    const levelMin = searchParams.get('levelMin')
    const levelMax = searchParams.get('levelMax')
    const atkMin = searchParams.get('atkMin')
    const atkMax = searchParams.get('atkMax')
    const defMin = searchParams.get('defMin')
    const defMax = searchParams.get('defMax')
    const sortField = searchParams.get('sortField') as SortField | null
    const sortDirection = searchParams.get('sortDirection') as SortDirection | null

    if (name) store.updateSearch(name)
    if (cardType) store.toggleCardType(cardType)
    if (frameType) store.toggleFrameType(frameType)
    if (attribute) store.toggleAttribute(attribute)
    if (banStatusTcg) store.setBanStatus(banStatusTcg)
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
