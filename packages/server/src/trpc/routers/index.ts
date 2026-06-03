/**
 * appRouter：聚合 main 端所有 router
 *
 * 类型 `AppRouter` 由 renderer 通过 `import type` 复用，不会引入运行时副作用。
 */
import { router } from '../trpc';

import { auditRouter } from './audit';
import { chatRouter } from './chat';
import { imageRouter } from './image';
import { knowledgeRouter } from './knowledge';
import { localEmbedderRouter } from './local-embedder';
import { mcpRouter } from './mcp';
import { promptRouter } from './prompt';
import { providerRouter } from './provider';
import { searchRouter } from './search';
import { settingsRouter } from './settings';
import { syncRouter } from './sync';
import { systemRouter } from './system';
import { toolRouter } from './tool';
import { voiceRouter } from './voice';

export const appRouter = router({
  provider: providerRouter,
  chat: chatRouter,
  image: imageRouter,
  tool: toolRouter,
  system: systemRouter,
  knowledge: knowledgeRouter,
  localEmbedder: localEmbedderRouter,
  prompt: promptRouter,
  search: searchRouter,
  settings: settingsRouter,
  mcp: mcpRouter,
  audit: auditRouter,
  voice: voiceRouter,
  sync: syncRouter,
});

export type AppRouter = typeof appRouter;
