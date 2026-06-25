import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * Builds a `wrapper` for `renderHook`/`render` that provides a fresh,
 * retry-disabled React Query client. Each call creates an isolated
 * `QueryClient` so tests don't share cache state.
 */
export function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}
