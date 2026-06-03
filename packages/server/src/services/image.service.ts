/**
 * ImageService：图像生成的业务编排
 *
 * generate 方法创建 'queued' 记录后启动异步后台任务：
 *   1. 更新状态为 'running'
 *   2. 通过 providerService 获取 provider 实例
 *   3. 调用 provider.image()
 *   4. 通过 HttpPort 下载图片
 *   5. 通过 FilePort 保存到 userData/images/
 *   6. 更新状态为 'done'（携带 resultPath + resultUrl）
 *   7. 失败时更新状态为 'error'（携带 error message）
 */
import path from 'node:path';

import {
  type ClockPort,
  type FilePort,
  type HttpPort,
  type ImageGenerateOptions,
  type ImageGenerateResult,
  type LoggerPort,
} from '@xiabao/core';

import type { ProviderService } from './provider.service';
import type { ImageRepo, ModelRepo } from '../repos';

export type ImageGenEvent =
  | { type: 'queued'; id: string }
  | { type: 'running'; id: string }
  | { type: 'done'; id: string; resultPath: string; resultUrl: string }
  | { type: 'error'; id: string; error: string };

export interface ImageGenerateInput {
  prompt: string;
  modelId: string;
  convId?: string;
  size?: string;
  quality?: string;
  n?: number;
  negative?: string;
  steps?: number;
  seed?: number;
  guidance?: number;
}

export interface ImageListInput {
  limit?: number;
  offset?: number;
  convId?: string;
}

export interface ImageServiceDeps {
  logger: LoggerPort;
  clock: ClockPort;
  http: HttpPort;
  file: FilePort;
  providerService: ProviderService;
  repos: {
    images: ImageRepo;
    models: ModelRepo;
  };
}

export function createImageService(deps: ImageServiceDeps) {
  const { logger, clock, http, file, providerService, repos } = deps;
  const log = logger.child({ mod: 'image.service' });

  async function saveImageToDisk(id: string, imageUrl: string): Promise<string> {
    const userDataDir = await file.getUserDataPath();
    const imagesDir = path.join(userDataDir, 'images');

    const res = await http.fetch(imageUrl);
    if (!res.ok) {
      throw new Error(`Failed to download image: ${res.status} ${await res.text()}`);
    }

    const bytes = await res.bytes();
    const ext = detectImageExt(imageUrl, bytes);
    const filename = `${id}${ext}`;
    const filePath = path.join(imagesDir, filename);

    await file.writeFile(filePath, bytes);
    return filePath;
  }

  function detectImageExt(url: string, _bytes: Uint8Array): string {
    const lower = url.toLowerCase();
    if (lower.includes('.png') || url.startsWith('data:image/png')) return '.png';
    if (lower.includes('.jpg') || lower.includes('.jpeg')) return '.jpg';
    if (lower.includes('.webp')) return '.webp';
    if (url.startsWith('data:image/gif')) return '.gif';
    return '.png';
  }

  async function runBackgroundTask(id: string, input: ImageGenerateInput): Promise<void> {
    const startedAt = clock.now();

    try {
      await repos.images.updateStatus(id, { status: 'running' });

      const model = await repos.models.findById(input.modelId);
      if (!model) {
        throw new Error(`Model not found: ${input.modelId}`);
      }

      const provider = await providerService.get(model.providerId);
      if (!provider) {
        throw new Error(`Provider not found: ${model.providerId}`);
      }

      const instance = await providerService.instantiate(provider);
      if (typeof instance.image !== 'function') {
        throw new Error(`Provider ${provider.kind} does not support image generation`);
      }

      const modelName = input.modelId.includes(':')
        ? input.modelId.slice(input.modelId.indexOf(':') + 1)
        : input.modelId;

      const imageOpts: ImageGenerateOptions = {
        model: modelName,
        prompt: input.prompt,
        size: input.size,
        quality: input.quality,
        n: input.n,
      };
      const result: ImageGenerateResult = await instance.image(imageOpts);

      let resultPath: string | undefined;
      try {
        resultPath = await saveImageToDisk(id, result.url);
      } catch (err) {
        log.warn('image save to disk failed, keeping URL only', {
          id,
          err: err instanceof Error ? err.message : String(err),
        });
        resultPath = undefined;
      }

      const durationMs = clock.now() - startedAt;
      await repos.images.updateStatus(id, {
        status: 'done',
        resultPath: resultPath ?? null,
        resultUrl: result.url,
        durationMs,
      });

      log.info('image generation completed', { id, durationMs });
    } catch (err) {
      const durationMs = clock.now() - startedAt;
      const errorMsg = err instanceof Error ? err.message : String(err);
      await repos.images.updateStatus(id, {
        status: 'error',
        error: errorMsg,
        durationMs,
      });
      log.error('image generation failed', { id, error: errorMsg });
    }
  }

  return {
    async generate(input: ImageGenerateInput): Promise<{ id: string }> {
      const model = await repos.models.findById(input.modelId);
      if (!model) {
        throw new Error(`Model not found: ${input.modelId}`);
      }

      const created = await repos.images.create({
        prompt: input.prompt,
        modelId: input.modelId,
        convId: input.convId,
        status: 'queued',
        negative: input.negative,
        steps: input.steps,
        seed: input.seed,
        guidance: input.guidance,
      });

      log.info('image generation queued', { id: created.id, modelId: input.modelId });

      // 异步启动后台任务，不阻塞返回
      void runBackgroundTask(created.id, input);

      return { id: created.id };
    },

    async list(input: ImageListInput = {}): Promise<Awaited<ReturnType<typeof repos.images.list>>> {
      return repos.images.list({
        limit: input.limit,
        offset: input.offset,
        convId: input.convId,
      });
    },

    async getById(id: string): Promise<Awaited<ReturnType<typeof repos.images.getById>>> {
      return repos.images.getById(id);
    },

    async *streamStatus(id: string): AsyncIterable<ImageGenEvent> {
      const POLL_INTERVAL = 800;
      const MAX_POLL_TIME = 5 * 60 * 1000; // 5 minutes

      const record = await repos.images.getById(id);
      if (!record) {
        yield { type: 'error', id, error: 'Image generation not found' };
        return;
      }

      yield { type: record.status as ImageGenEvent['type'], id } as ImageGenEvent;

      if (record.status === 'done') {
        yield {
          type: 'done',
          id,
          resultPath: record.resultPath ?? '',
          resultUrl: record.resultUrl ?? '',
        };
        return;
      }

      if (record.status === 'error') {
        yield { type: 'error', id, error: record.error ?? 'Unknown error' };
        return;
      }

      const startPolling = clock.now();
      let lastStatus = record.status;

      while (clock.now() - startPolling < MAX_POLL_TIME) {
        await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL));

        const updated = await repos.images.getById(id);
        if (!updated) {
          yield { type: 'error', id, error: 'Image generation disappeared' };
          return;
        }

        if (updated.status !== lastStatus) {
          switch (updated.status) {
            case 'queued':
              yield { type: 'queued', id };
              break;
            case 'running':
              yield { type: 'running', id };
              break;
            case 'done':
              yield {
                type: 'done',
                id,
                resultPath: updated.resultPath ?? '',
                resultUrl: updated.resultUrl ?? '',
              };
              return;
            case 'error':
              yield { type: 'error', id, error: updated.error ?? 'Unknown error' };
              return;
          }
          lastStatus = updated.status;
        }

        if (updated.status === 'done' || updated.status === 'error') {
          return;
        }
      }

      yield { type: 'error', id, error: 'Image generation timed out' };
    },
  };
}

export type ImageService = ReturnType<typeof createImageService>;
