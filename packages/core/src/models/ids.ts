/**
 * ID 生成与校验
 *
 * 跨端约定：所有主键用 nanoid(21)，跨设备永不冲突。
 */
import { nanoid } from 'nanoid';
import { z } from 'zod';

export const ID_LEN = 21;
export const IdSchema = z.string().min(1).max(64);
export type Id = z.infer<typeof IdSchema>;

export function newId(): string {
  return nanoid(ID_LEN);
}

/** Provider ID：'openai' | 'custom-xxx'（不用 nanoid，保留 URL 友好） */
export function newCustomProviderId(): string {
  return `custom-${nanoid(10)}`;
}

/** Model ID：'providerId:modelName'（例 'openai:gpt-4o-mini'） */
export function composeModelId(providerId: string, modelName: string): string {
  return `${providerId}:${modelName}`;
}

export function parseModelId(modelId: string): { providerId: string; modelName: string } {
  const idx = modelId.indexOf(':');
  if (idx <= 0) {
    throw new Error(`Invalid modelId: "${modelId}", expected "<providerId>:<modelName>"`);
  }
  return {
    providerId: modelId.slice(0, idx),
    modelName: modelId.slice(idx + 1),
  };
}
