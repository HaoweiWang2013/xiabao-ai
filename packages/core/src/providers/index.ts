/**
 * @xiabao/core/providers · Provider 抽象与注册表
 *
 * 具体实现（OpenAI / Anthropic / DeepSeek / ...）在 `./impl/*` 下按需导入，
 * 调用 `registerProviderFactory(kind, factory)` 完成注册。
 */

export * from './types';
export * from './registry';
export * from './capabilities';
export {
  setLocalEmbedderEngine,
  getLocalEmbedderEngine,
  LOCAL_EMBEDDER_NOT_READY,
  type LocalEmbedderEngine,
  type LocalEmbedderModelInfo,
} from './impl/local-embedder';

// 注册内置 Provider（副作用 import）
import './impl/openai';
import './impl/anthropic';
import './impl/google';
import './impl/ollama';
import './impl/local-embedder';
