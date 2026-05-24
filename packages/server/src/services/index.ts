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

import { createChatService, type ChatService } from './chat.service';
import { createImageService, type ImageService } from './image.service';
import { createKnowledgeService, type KnowledgeService } from './knowledge.service';
import { createLocalEmbedderService, type LocalEmbedderService } from './local-embedder.service';
import { createPromptService, type PromptService } from './prompt.service';
import { createProviderService, type ProviderService } from './provider.service';
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
  /** M4 长尾 Phase 5-Pro：本地 embedder 模型管理服务 */
  localEmbedder: LocalEmbedderService;
  /** M2 · 提示词库服务 */
  prompt: PromptService;
  /** M5 · 图像生成服务 */
  image: ImageService;
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
    repos: { images: deps.repos.images },
  });

  return { provider, chat, tool, system, knowledge, localEmbedder, prompt, image };
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
  ProviderService,
  ChatService,
  SystemService,
  KnowledgeService,
  LocalEmbedderService,
  PromptService,
  ImageService,
};
export type { ImageGenEvent, ImageGenerateInput, ImageListInput } from './image.service';
export type { DevInfo, SystemPaths, SystemAppInfo } from './system.service';
export {
  BUILTIN_LOCAL_EMBEDDER_MODELS,
  type BuiltinLocalEmbedderModel,
  type LocalEmbedderProgressEvent,
  type LocalEmbedderManagement,
} from './local-embedder.service';
