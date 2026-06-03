/**
 * Repo 聚合：统一从 AppDb + ClockPort 构造全部 repo
 */
import type { ClockPort } from '@xiabao/core';

import { createAuditRepo, type AuditRepo } from './audit';
import { createConversationRepo, type ConversationRepo } from './conversations';
import { createImageRepo, type ImageRepo } from './images';
import { createKnowledgeRepo, type KnowledgeRepo } from './knowledge';
import { createMcpRepo, type McpRepo } from './mcp';
import { createMessageRepo, type MessageRepo } from './messages';
import { createModelRepo, type ModelRepo } from './models';
import { createPromptRepo, type PromptRepo } from './prompts';
import { createProviderRepo, type ProviderRepo } from './providers';
import { createSettingsRepo, type SettingsRepo } from './settings';
import { createSyncRepo, type SyncRepo } from './sync';
import { createVoiceRepo, type VoiceRepo } from './voice';

import type { AppDb } from '../db';

export interface Repos {
  providers: ProviderRepo;
  models: ModelRepo;
  settings: SettingsRepo;
  conversations: ConversationRepo;
  messages: MessageRepo;
  knowledge: KnowledgeRepo;
  prompts: PromptRepo;
  images: ImageRepo;
  mcp: McpRepo;
  audit: AuditRepo;
  voice: VoiceRepo;
  sync: SyncRepo;
}

export interface RepoDeps {
  db: AppDb;
  clock: ClockPort;
  deviceId?: string;
}

export function createRepos({ db, clock, deviceId }: RepoDeps): Repos {
  const now = () => clock.now();
  return {
    providers: createProviderRepo({ db, now, deviceId }),
    models: createModelRepo({ db, now, deviceId }),
    settings: createSettingsRepo({ db, now, deviceId }),
    conversations: createConversationRepo({ db, now, deviceId }),
    messages: createMessageRepo({ db, now, deviceId }),
    knowledge: createKnowledgeRepo({ db, now }),
    prompts: createPromptRepo({ db, now }),
    images: createImageRepo({ db, now }),
    mcp: createMcpRepo({ db, now }),
    audit: createAuditRepo({ db, now }),
    voice: createVoiceRepo({ db, now }),
    sync: createSyncRepo({ db, now }),
  };
}

export type {
  AuditRepo,
  VoiceRepo,
  SyncRepo,
  ConversationRepo,
  ImageRepo,
  KnowledgeRepo,
  McpRepo,
  MessageRepo,
  ModelRepo,
  PromptRepo,
  ProviderRepo,
  SettingsRepo,
};
export type { MessageWithParts, NewPart } from './messages';
export type { NewChunkInput, NewDocInput } from './knowledge';
export type { SeedBuiltinPromptInput } from './prompts';
