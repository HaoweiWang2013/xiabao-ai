/**
 * Service 聚合入口
 *
 * tRPC router 只与 Service 层通信；Service 内部组合 Repo + Port + ProviderRegistry。
 */
import type {
  BinaryTextExtractor,
  ClockPort,
  FilePort,
  HttpPort,
  LoggerPort,
  SecretPort,
  VectorStore,
} from '@xiabao/core';

import type { Client } from '@libsql/client';

import { createAgentService, type AgentService } from './agent.service';
import { createChatService, type ChatService } from './chat.service';
import { createImageService, type ImageService } from './image.service';
import { createKnowledgeService, type KnowledgeService } from './knowledge.service';
import { createLocalEmbedderService, type LocalEmbedderService } from './local-embedder.service';
import { createMcpService, type McpService } from './mcp.service';
import { createVoiceService, type VoiceService } from './voice.service';
import { createSyncService, type SyncService } from './sync.service';
import { createPromptService, type PromptService } from './prompt.service';
import { createProviderService, type ProviderService } from './provider.service';
import { createSearchService, type SearchService } from './search.service';
import {
  createSystemService,
  type SystemAppInfo,
  type SystemPaths,
  type SystemService,
} from './system.service';
import { createToolService, type ToolService } from './tool.service';

import type { AppDb } from '../db';
import type { Repos } from '../repos';

export interface Services {
  provider: ProviderService;
  chat: ChatService;
  tool: ToolService;
  system: SystemService;
  knowledge: KnowledgeService;
  localEmbedder: LocalEmbedderService;
  prompt: PromptService;
  image: ImageService;
  search: SearchService;
  mcp: McpService;
  agent: AgentService;
  voice: VoiceService;
  sync: SyncService;
}

export interface ServicesDeps {
  http: HttpPort;
  secret: SecretPort;
  file: FilePort;
  logger: LoggerPort;
  clock: ClockPort;
  repos: Repos;
  /** 透出给 system.service 用的应用 / 文件路径信息 */
  db: AppDb;
  /** 原始 libsql client，供 FTS5 等需要直接执行 SQL 的服务使用 */
  client: Client;
  paths?: SystemPaths;
  app?: SystemAppInfo;
  /**
   * 二进制文档抽取器（PDF / DOCX / 未来 PPTX。M4 长尾 Phase 1）。
   * 缺省 = `createNodeBinaryExtractor()`（懒加载 pdfjs / mammoth）。测试可注入 fake。
   */
  binaryExtractor?: BinaryTextExtractor;
  /**
   * 向量存储（M4 长尾 Phase 4）。缺省让 `KnowledgeService` 自动构造内存 store + 缓存。
   * 平台侧（如 desktop）未来可注入 `SqliteVecStore`。
   */
  vectorStore?: VectorStore;
}

export function createServices(deps: ServicesDeps): Services {
  const provider = createProviderService({
    http: deps.http,
    secret: deps.secret,
    logger: deps.logger,
    repos: { providers: deps.repos.providers, models: deps.repos.models },
  });

  const tool = createToolService({
    logger: deps.logger,
    http: deps.http,
    settings: deps.repos.settings as { get: <K extends string>(key: K) => Promise<unknown> },
  });

  const knowledge = createKnowledgeService({
    logger: deps.logger,
    http: deps.http,
    instantiateProvider: provider.instantiate,
    repos: { knowledge: deps.repos.knowledge, providers: deps.repos.providers },
    binaryExtractor: deps.binaryExtractor,
    vectorStore: deps.vectorStore,
  });

  const chat = createChatService({
    logger: deps.logger,
    clock: deps.clock,
    providerService: provider,
    toolService: tool,
    knowledgeService: knowledge,
    getSetting: async (key: string) => deps.repos.settings.get(key as never),
    repos: {
      conversations: deps.repos.conversations,
      messages: deps.repos.messages,
      models: deps.repos.models,
      providers: deps.repos.providers,
    },
  });

  const system = createSystemService({
    logger: deps.logger,
    db: deps.db,
    paths: deps.paths,
    app: deps.app,
  });

  const localEmbedder = createLocalEmbedderService();

  const prompt = createPromptService({
    logger: deps.logger,
    repos: { prompts: deps.repos.prompts },
  });

  const image = createImageService({
    logger: deps.logger,
    clock: deps.clock,
    http: deps.http,
    file: deps.file,
    providerService: provider,
    repos: { images: deps.repos.images, models: deps.repos.models },
  });

  const search = createSearchService({
    logger: deps.logger,
    client: deps.client,
    messages: deps.repos.messages,
  });

  const mcp = createMcpService({
    logger: deps.logger,
    http: deps.http,
    repos: { mcp: deps.repos.mcp },
  });

  const agent = createAgentService({
    logger: deps.logger,
    clock: deps.clock,
    providerService: provider,
    toolService: tool,
    mcpService: mcp,
    repos: { agents: deps.repos.agents, models: deps.repos.models, audit: deps.repos.audit },
  });

  const voice = createVoiceService({
    logger: deps.logger,
    clock: deps.clock,
    file: deps.file,
    providerService: provider,
    repos: { voice: deps.repos.voice },
  });

  const sync = createSyncService({
    logger: deps.logger,
    clock: deps.clock,
    repos: { sync: deps.repos.sync },
  });

  return {
    provider,
    chat,
    tool,
    system,
    knowledge,
    localEmbedder,
    prompt,
    image,
    search,
    mcp,
    agent,
    voice,
    sync,
  };
}

export type {
  ChatStreamEvent,
  SendMessageInput,
  RegenerateInput,
  EditAndResendInput,
  KnowledgeContextInput,
} from './chat.service';
export type { SearchHit } from './knowledge.service';
export type {
  IngestProgress,
  IngestPhase,
  IngestJob,
  IngestQueue,
  IngestQueueOptions,
} from './ingest-queue';
export type {
  AgentService,
  ChatService,
  ImageService,
  KnowledgeService,
  LocalEmbedderService,
  McpService,
  VoiceService,
  PromptService,
  ProviderService,
  SearchService,
  SystemService,
};
export type { ImageGenEvent, ImageGenerateInput, ImageListInput } from './image.service';
export type { SearchQueryInput, SearchResult } from './search.service';
export type { DevInfo, SystemPaths, SystemAppInfo } from './system.service';
export {
  BUILTIN_LOCAL_EMBEDDER_MODELS,
  type BuiltinLocalEmbedderModel,
  type LocalEmbedderProgressEvent,
  type LocalEmbedderManagement,
} from './local-embedder.service';
