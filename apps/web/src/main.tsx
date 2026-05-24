import { createWSClient, httpBatchLink, splitLink, wsLink } from '@trpc/client';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import superjson from 'superjson';

import { setTrpcClientFactory, trpc, TrpcProvider } from '@xiabao/app-ui';

import { App } from './App';

import '@xiabao/theme/css-variables';
import '@xiabao/theme/highlight';
import './styles.css';

const HTTP_URL =
  (import.meta.env?.VITE_TRPC_HTTP as string | undefined) ??
  `http://${window.location.hostname}:4317/trpc`;
const WS_URL =
  (import.meta.env?.VITE_TRPC_WS as string | undefined) ??
  `ws://${window.location.hostname}:4317/trpc-ws`;

setTrpcClientFactory(() => {
  const wsClient = createWSClient({ url: WS_URL });
  return trpc.createClient({
    transformer: superjson,
    links: [
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: wsLink({ client: wsClient }),
        false: httpBatchLink({ url: HTTP_URL }),
      }),
    ],
  });
});

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

createRoot(container).render(
  <StrictMode>
    <TrpcProvider>
      <JotaiProvider>
        <App />
      </JotaiProvider>
    </TrpcProvider>
  </StrictMode>,
);
