/**
 * appRouter：聚合 main 端所有 router
 *
 * 类型 `AppRouter` 由 renderer 通过 `import type` 复用，不会引入运行时副作用。
 */
import { router } from '../trpc';

import { chatRouter } from './chat';
import { imageRouter } from './image';
import { knowledgeRouter } from './knowledge';
import { localEmbedderRouter } from './local-embedder';
import { promptRouter } from './prompt';
import { providerRouter } from './provider';
import { systemRouter } from './system';
import { toolRouter } from './tool';

export const appRouter = router({
  provider: providerRouter,
  chat: chatRouter,
  image: imageRouter,
  tool: toolRouter,
  system: systemRouter,
  knowledge: knowledgeRouter,
  localEmbedder: localEmbedderRouter,
  /** M2 · 提示词库 */
  prompt: promptRouter,
});

export type AppRouter = typeof appRouter;
