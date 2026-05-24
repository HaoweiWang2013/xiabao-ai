/**
 * ProviderService：Provider/Model 的业务编排
 *
 * - 屏蔽 SecretPort 细节（API Key 通过 SecretPort 持久化，DB 仅存 ref）
 * - 通过 ProviderRegistry 把"配置 Row"实例化为可调用的 ChatProvider
 * - 暴露 testConnection / listModels（远端拉取 + 本地 upsert）
 */
import {
  composeModelId,
  getProviderFactory,
  type HttpPort,
  type LoggerPort,
  type Model,
  type ModelCapability,
  type ModelPricing,
  type Provider,
  type ProviderCreateInput,
  type ProviderListedModel,
  type ProviderUpdateInput,
  type SecretPort,
} from '@xiabao/core';

import type { ModelRepo, ProviderRepo } from '../repos';

export interface ProviderServiceDeps {
  http: HttpPort;
  secret: SecretPort;
  logger: LoggerPort;
  repos: {
    providers: ProviderRepo;
    models: ModelRepo;
  };
}

export interface ProviderWithModels {
  provider: Provider;
  models: Model[];
}

export interface ProviderTestResult {
  ok: boolean;
  modelsCount?: number;
  error?: string;
}

export function createProviderService(deps: ProviderServiceDeps) {
  const { http, secret, logger, repos } = deps;
  const log = logger.child({ mod: 'provider.service' });

  function refForProvider(id: string): string {
    return `provider:${id}`;
  }

  async function instantiate(provider: Provider) {
    const factory = getProviderFactory(provider.kind);
    if (!factory) {
      throw new Error(`Unsupported provider kind: ${provider.kind}`);
    }
    const apiKey = provider.apiKeyRef ? await secret.get(provider.apiKeyRef) : null;
    return factory({
      http,
      logger: log,
      apiKey,
      baseUrl: provider.baseUrl,
      extra: provider.extra,
    });
  }

  return {
    /** 已注入到 ChatService 的实例化入口（不公开 SecretPort 细节） */
    instantiate,

    async list(): Promise<Provider[]> {
      return repos.providers.list();
    },

    async get(id: string): Promise<Provider | null> {
      return repos.providers.findById(id);
    },

    async getOrThrow(id: string): Promise<Provider> {
      const p = await repos.providers.findById(id);
      if (!p) throw new Error(`Provider not found: ${id}`);
      return p;
    },

    async create(input: ProviderCreateInput): Promise<Provider> {
      // 先建 row（无 apiKeyRef）拿到 id；若有 apiKey 再写 secret 并回填 ref
      const created = await repos.providers.create(input, null);
      if (input.apiKey) {
        const ref = refForProvider(created.id);
        await secret.set(ref, input.apiKey);
        return repos.providers.update({ id: created.id }, ref);
      }
      return created;
    },

    async update(input: ProviderUpdateInput): Promise<Provider> {
      // apiKey 处理：明文不入库，只更 SecretPort + ref
      let apiKeyRefPatch: string | null | undefined;
      if (input.apiKey !== undefined) {
        const ref = refForProvider(input.id);
        if (input.apiKey === '') {
          await secret.delete(ref);
          apiKeyRefPatch = null;
        } else {
          await secret.set(ref, input.apiKey);
          apiKeyRefPatch = ref;
        }
      }
      const { apiKey: _omit, ...patch } = input;
      void _omit;
      return repos.providers.update(patch, apiKeyRefPatch);
    },

    async remove(id: string): Promise<void> {
      const provider = await repos.providers.findById(id);
      if (!provider) return;
      if (provider.apiKeyRef) {
        try {
          await secret.delete(provider.apiKeyRef);
        } catch (err) {
          log.warn('secret delete failed', { id, err: String(err) });
        }
      }
      await repos.providers.softDelete(id);
    },

    async setEnabled(id: string, enabled: boolean): Promise<Provider> {
      return repos.providers.update({ id, enabled });
    },

    async listLocalModels(providerId: string): Promise<Model[]> {
      return repos.models.listByProvider(providerId);
    },

    async listModelsRemote(id: string): Promise<Model[]> {
      const provider = await this.getOrThrow(id);
      const instance = await instantiate(provider);
      const listed = await instance.listModels();
      log.info('listModels remote', { id, count: listed.length });
      return repos.models.upsertFromProvider(id, listed);
    },

    /**
     * 仅探测远端 model 列表，不写入本地 models 表。
     * 用于 UI「从 Provider 拉一份候选清单 → 让用户多选添加」场景。
     */
    async probeRemoteModels(id: string): Promise<ProviderListedModel[]> {
      const provider = await this.getOrThrow(id);
      const instance = await instantiate(provider);
      return instance.listModels();
    },

    /**
     * 草稿态 probe（P9 · 新建 Provider stepper 用）：
     *
     * 用 in-memory 凭证（不入库 + 不进 SecretPort）实例化 ChatProvider 后拉一次 listModels。
     * UI 流程：Step 1 填 name/kind/baseUrl/apiKey → Step 2 调本接口拉候选 → 用户多选 →
     *         Step 完成时 `create()` + `upsertModels()` 一并写库。
     */
    async probeRemoteByCreds(input: {
      kind: Provider['kind'];
      baseUrl: string | null;
      apiKey?: string;
      extra?: Provider['extra'];
    }): Promise<ProviderListedModel[]> {
      const factory = getProviderFactory(input.kind);
      if (!factory) {
        throw new Error(`Unsupported provider kind: ${input.kind}`);
      }
      // local-embedder 不走云端 listModels（它的模型清单来自本地 engine.listModels）
      if (input.kind === 'local-embedder') {
        return [];
      }
      const instance = factory({
        http,
        logger: log,
        apiKey: input.apiKey ?? null,
        baseUrl: input.baseUrl,
        extra: input.extra ?? {},
      });
      const listed = await instance.listModels();
      log.info('probeRemoteByCreds', { kind: input.kind, count: listed.length });
      return listed;
    },

    /**
     * 添加单个模型（手动输入或勾选探测结果）。
     * 走 repos.models.upsertFromProvider 复用 upsert 逻辑——已存在则更新。
     */
    async upsertModel(
      providerId: string,
      input: {
        name: string;
        display?: string;
        family?: string;
        contextTokens?: number;
        maxOutput?: number;
        capability?: ModelCapability;
        pricing?: ModelPricing;
      },
    ): Promise<Model> {
      await this.getOrThrow(providerId);
      const [created] = await repos.models.upsertFromProvider(providerId, [
        {
          name: input.name,
          display: input.display ?? input.name,
          family: input.family,
          contextTokens: input.contextTokens,
          maxOutput: input.maxOutput,
          capability: input.capability,
          pricing: input.pricing,
        },
      ]);
      if (!created) {
        throw new Error('Failed to upsert model');
      }
      return created;
    },

    /** 批量添加（UI 多选场景） */
    async upsertModels(providerId: string, items: ProviderListedModel[]): Promise<Model[]> {
      await this.getOrThrow(providerId);
      return repos.models.upsertFromProvider(providerId, items);
    },

    async updateModel(
      id: string,
      patch: {
        display?: string;
        family?: string | null;
        contextTokens?: number | null;
        maxOutput?: number | null;
        capability?: ModelCapability;
        pricing?: ModelPricing | null;
        sortIndex?: number;
      },
    ): Promise<Model> {
      const r = await repos.models.update(id, patch);
      if (!r) throw new Error(`Model not found: ${id}`);
      return r;
    },

    async setModelEnabled(id: string, enabled: boolean): Promise<void> {
      await repos.models.setEnabled(id, enabled);
    },

    async removeModel(id: string): Promise<void> {
      await repos.models.softDelete(id);
    },

    /** 工具方法：UI 端用来生成 model id 的同款逻辑 */
    composeId(providerId: string, name: string): string {
      return composeModelId(providerId, name);
    },

    async testConnection(id: string): Promise<ProviderTestResult> {
      const provider = await this.getOrThrow(id);
      const instance = await instantiate(provider);
      const r = await instance.testConnection();
      if (r.ok) return { ok: true, modelsCount: r.modelsCount };
      return { ok: false, error: r.error };
    },

    async listWithModels(): Promise<ProviderWithModels[]> {
      const providers = await repos.providers.list();
      const result: ProviderWithModels[] = [];
      for (const p of providers) {
        const models = await repos.models.listByProvider(p.id);
        result.push({ provider: p, models });
      }
      return result;
    },
  };
}

export type ProviderService = ReturnType<typeof createProviderService>;
