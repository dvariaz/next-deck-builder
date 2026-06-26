import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { makeCard } from '../../test-utils/makeCard'
import { createQueryWrapper } from '@/modules/common/test-utils/queryWrapper'
import { makePaginatedResponse } from '@/modules/common/test-utils/apiResponse'

const cardsControllerFindAll = vi.fn()

vi.mock('@/generated/api/cards/cards', () => ({
  cardsControllerFindAll: (...args: unknown[]) => cardsControllerFindAll(...args),
  getCardsControllerFindAllQueryKey: (params: unknown) => ['/cards', params],
}))

import { useCardsInfinite } from './useCardsInfinite'

beforeEach(() => {
  cardsControllerFindAll.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useCardsInfinite', () => {
  it('flattens page results into a single cards array and exposes the total', async () => {
    cardsControllerFindAll.mockResolvedValue(
      makePaginatedResponse([makeCard({ id: 'a' }), makeCard({ id: 'b' })], { total: 2 }),
    )

    const { result } = renderHook(() => useCardsInfinite({ name: 'dragon' }), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.cards.map((c) => c.id)).toEqual(['a', 'b'])
    expect(result.current.total).toBe(2)
  })

  it('returns empty cards and zero total before data loads', () => {
    cardsControllerFindAll.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useCardsInfinite({ name: '' }), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.cards).toEqual([])
    expect(result.current.total).toBe(0)
  })

  it('paginates with skip based on the number of already-loaded cards', async () => {
    const firstPage = Array.from({ length: 30 }, (_, i) => makeCard({ id: `a${i}` }))
    const secondPage = Array.from({ length: 30 }, (_, i) => makeCard({ id: `b${i}` }))

    cardsControllerFindAll.mockImplementation((params: { skip: number }) =>
      Promise.resolve(makePaginatedResponse(params.skip === 0 ? firstPage : secondPage, { total: 60 })),
    )

    const { result } = renderHook(() => useCardsInfinite({ name: '' }), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.cards).toHaveLength(30)
    expect(result.current.hasNextPage).toBe(true)

    await act(async () => {
      await result.current.fetchNextPage()
    })

    await waitFor(() => expect(result.current.cards).toHaveLength(60))
    expect(cardsControllerFindAll).toHaveBeenLastCalledWith(
      expect.objectContaining({ skip: 30, take: 30 }),
    )
    expect(result.current.hasNextPage).toBe(false)
  })

  it('always requests the configured page size', async () => {
    cardsControllerFindAll.mockResolvedValue(makePaginatedResponse([makeCard()], { total: 1 }))

    renderHook(() => useCardsInfinite({ name: '' }), { wrapper: createQueryWrapper() })

    await waitFor(() => expect(cardsControllerFindAll).toHaveBeenCalled())
    expect(cardsControllerFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 30 }),
    )
  })

  it('debounces the q param, refetching only after the debounce window', async () => {
    vi.useFakeTimers()
    cardsControllerFindAll.mockResolvedValue(makePaginatedResponse([makeCard()], { total: 1 }))

    const { rerender } = renderHook((props) => useCardsInfinite(props), {
      wrapper: createQueryWrapper(),
      initialProps: { q: 'a' },
    })

    // Initial fetch uses the starting query.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(cardsControllerFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'a' }),
    )

    // Changing q does not refetch before the debounce elapses.
    rerender({ q: 'ab' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(399)
    })
    expect(cardsControllerFindAll).not.toHaveBeenCalledWith(
      expect.objectContaining({ q: 'ab' }),
    )

    // Once the window passes, the new query is used.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(cardsControllerFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'ab' }),
    )
  })
})
