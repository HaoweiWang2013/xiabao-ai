/**
 * ChatProvider 抽象
 *
 * 每个具体 Provider（OpenAI / Anthropic / ...）实现此接口。
 * Provider 实现层允许依赖 Vercel AI SDK，但必须把外部类型适配到我们自己的 Port/Model 契约上。
 */
import type {
  ChatTurn,
  FinishReason,
  MessageRole,
  ModelCapability,
  ProviderListedModel,
} from '../models/index.js';
import type { HttpPort, LoggerPort } from '../ports/index.js';

export interface ChatCallOptions {
  modelName: string;
  turns: ChatTurn[];
  systemPrompt?: string | null;
  temperature?: number | null;
  topP?: number | null;
  maxOutputTokens?: number | null;
  tools?: ProviderToolSpec[];
  /** 由上层注入，用于取消流 */
  signal?: AbortSignal;
  /** Provider 侧的额外原始参数透传（谨慎使用） */
  raw?: Record<string, unknown>;
}

export interface ProviderToolSpec {
  name: string;
  description?: string;
  /** JSON Schema（OpenAPI 风格子集） */
  parameters: Record<string, unknown>;
}

export interface ChatStreamChunk {
  /** 本次增量的文本；空串代表其它事件（例如 finish） */
  delta?: string;
  /** 思维链增量（仅支持 reasoning 的模型） */
  reasoningDelta?: string;
  /** 工具调用事件（累积） */
  toolCall?: {
    toolCallId: string;
    toolName: string;
    argsJson: string;
    /** 本块是否为工具调用的"已完成"状态 */
    done: boolean;
  };
  /** 终止信息（仅在最后一个 chunk 出现） */
  finish?: {
    reason: FinishReason;
    tokensIn?: number;
    tokensOut?: number;
    /** 原始 Provider 响应（用于调试） */
    raw?: unknown;
  };
}

export interface EmbedOptions {
  /** Provider 内的具体 embedding 模型名，例如 'text-embedding-3-small' */
  modelName: string;
  /** 待向量化的输入；调用方负责按 token 上限分批 */
  inputs: string[];
  signal?: AbortSignal;
}

export interface EmbedResult {
  /** 与 inputs 顺序一致的向量数组，每个为 number[] */
  embeddings: number[][];
  /** 向量维度（用于校验是否与 KB.vectorDim 匹配） */
  dim: number;
  /** 整批的 token 用量（可选） */
  tokensIn?: number;
}

export interface ImageGenerateOptions {
  model: string;
  prompt: string;
  size?: string;
  quality?: string;
  n?: number;
  signal?: AbortSignal;
}

export interface ImageGenerateResult {
  url: string;
  model: string;
  count: number;
}

export interface ChatProvider {
  /** Provider 配置的稳定 ID（例 'openai' | 'custom-abc'） */
  readonly id: string;
  /** 预定义 kind（用于 UI 图标与兼容判断） */
  readonly kind: string;

  /** 探测连通性，拉取模型清单 */
  listModels(): Promise<ProviderListedModel[]>;

  /** 测试连接（通常是 listModels 的轻量版本） */
  testConnection(): Promise<{ ok: true; modelsCount: number } | { ok: false; error: string }>;

  /** 流式对话：返回 AsyncIterable，由上层消费 */
  chat(options: ChatCallOptions): AsyncIterable<ChatStreamChunk>;

  /**
   * 批量计算 embedding。可选 —— 不支持的 Provider（Anthropic 等）不实现此方法。
   * 调用方应先 `typeof provider.embed === 'function'` 判断。
   */
  embed?(options: EmbedOptions): Promise<EmbedResult>;

  /**
   * 图像生成。可选 —— 不支持的 Provider 不实现此方法。
   * 调用方应先 `typeof provider.image === 'function'` 判断。
   */
  image?(options: ImageGenerateOptions): Promise<ImageGenerateResult>;
}

/**
 * Provider 构造所需的依赖（统一通过 Ports 注入）。
 * 任何 Provider 实现不可 new fetch / require('fs') —— 必须用 ports.http / ports.file。
 */
export interface ProviderFactoryDeps {
  http: HttpPort;
  logger: LoggerPort;
  /** 明文 API key，从 SecretPort 读出后传入，Provider 自己不持久化 */
  apiKey?: string | null;
  baseUrl?: string | null;
  extra?: Record<string, unknown>;
}

/** Provider 工厂：根据一条 Provider 配置创建实例 */
export type ProviderFactory = (deps: ProviderFactoryDeps) => ChatProvider;

// 公用小工具
export function roleToOpenAI(role: MessageRole): 'user' | 'assistant' | 'system' | 'tool' {
  return role;
}

export function defaultCapability(): ModelCapability {
  return { streaming: true };
}
