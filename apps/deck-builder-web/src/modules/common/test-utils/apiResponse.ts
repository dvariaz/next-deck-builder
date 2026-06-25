import type { PaginationResponseDto } from '@/generated/model'

/**
 * Wraps `data` in the shape the orval-generated client returns from an
 * endpoint call (`{ data, status, headers }`). Use in tests that mock a
 * generated client function.
 */
export function makeApiResponse<T>(data: T, status = 200 as const) {
  return {
    data,
    status,
    headers: new Headers(),
  }
}

/**
 * Builds an orval response for a paginated list endpoint. `total` defaults to
 * the number of results; override it (and `skip`/`take`) to simulate
 * multi-page responses.
 */
export function makePaginatedResponse<T>(
  results: T[],
  pagination: Partial<PaginationResponseDto> = {},
) {
  return makeApiResponse({
    results,
    pagination: {
      total: results.length,
      skip: 0,
      take: 30,
      ...pagination,
    },
  })
}
