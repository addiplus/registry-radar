import { QueryClient, isServer } from '@tanstack/react-query';
import { isApiError } from '@/lib/api-error';
import { GC_TIME, STALE_TIME } from '@/lib/constants';

// TanStack two-file pattern for App Router SSR hydration.
// Server: a fresh client per request (no cross-request state).
// Browser: one module singleton for the life of the tab.
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // staleTime above zero is mandatory: it lets SSR-prefetched data
        // hydrate on the client without an immediate refetch.
        staleTime: STALE_TIME.packageMeta,
        gcTime: GC_TIME,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) =>
          isApiError(error) &&
          ['NOT_FOUND', 'RATE_LIMITED', 'SECONDARY_LIMIT', 'INVALID_INPUT'].includes(error.code)
            ? false
            : failureCount < 2,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
