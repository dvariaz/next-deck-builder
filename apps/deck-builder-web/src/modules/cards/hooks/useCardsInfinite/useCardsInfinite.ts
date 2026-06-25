import { useState, useEffect } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { cardsControllerFindAll, getCardsControllerFindAllQueryKey } from '@/generated/api/cards/cards'
import type { CardsControllerFindAllParams, CardResponseDto } from '@/generated/model'

const PAGE_SIZE = 30
const SEARCH_DEBOUNCE_MS = 400

function useSearchDebounce(params: CardsControllerFindAllParams): CardsControllerFindAllParams {
  const [debouncedName, setDebouncedName] = useState(params.name)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedName(params.name), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [params.name])

  return { ...params, name: debouncedName }
}

export function useCardsInfinite(params: CardsControllerFindAllParams) {
  const debouncedParams = useSearchDebounce(params)

  const query = useInfiniteQuery({
    queryKey: [...getCardsControllerFindAllQueryKey(debouncedParams), 'infinite'],
    queryFn: ({ pageParam }) =>
      cardsControllerFindAll({ ...debouncedParams, skip: pageParam as number, take: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.data.results.length, 0)
      const total = lastPage.data.pagination.total
      return loaded < total ? loaded : undefined
    },
  })

  const cards: CardResponseDto[] = query.data?.pages.flatMap((page) => page.data.results) ?? []
  const total = query.data?.pages[0]?.data.pagination.total ?? 0

  return { ...query, cards, total }
}
