import { ipcLink } from 'electron-trpc/renderer';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import superjson from 'superjson';

import { setTrpcClientFactory, trpc, TrpcProvider } from '@xiabao/app-ui';

import { App } from './App';

import '@xiabao/theme/css-variables';
import '@xiabao/theme/highlight';
import './styles.css';

setTrpcClientFactory(() =>
  trpc.createClient({
    transformer: superjson,
    links: [ipcLink()],
  }),
);

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root element not found');
}

const root = createRoot(container);
root.render(
  <StrictMode>
    <TrpcProvider>
      <JotaiProvider>
        <App />
      </JotaiProvider>
    </TrpcProvider>
  </StrictMode>,
);
