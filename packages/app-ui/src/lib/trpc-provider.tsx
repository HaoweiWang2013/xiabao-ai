/**
 * TrpcProvider：把 trpc + react-query 装到 React 树上
 *
 * 客户端工厂由各端通过 `setTrpcClientFactory()` 注入。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { buildTrpcClient, trpc } from './trpc';

import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function TrpcProvider({ children }: Props) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5_000, refetchOnWindowFocus: false },
        },
      }),
  );
  const trpcClient = useMemo(() => buildTrpcClient(), []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
