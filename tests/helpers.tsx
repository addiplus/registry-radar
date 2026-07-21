import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

// Fresh client per test: retries off so failures surface immediately,
// gcTime Infinity so queries are never garbage collected mid-assertion.
export function makeTestClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

export function renderWithQueryClient(
  ui: ReactElement,
  client: QueryClient = makeTestClient(),
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, ...render(ui, { wrapper: Wrapper }) };
}
