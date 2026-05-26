/**
 * 能力推断 · 根据 model name / family 给出默认 ModelCapability。
 *
 * 设计原则：
 * - 纯函数 + 同名/前缀匹配；保守预测（拿不准就给 false）。
 * - 仅作为「添加模型时的默认勾选值」与「Provider 自报缺失能力时的兜底」。
 *   用户在 UI 上仍可覆盖。
 *
 * 数据来源：各家官方文档 + 主流社区共识（截至 2025-Q4）。
 *
 * 详见 `docs/07-providers.md` §模型能力。
 */
import type { ModelCapability } from '../models/index.js';

interface CapabilityRule {
  /** 命中则赋予对应能力，使用 lower-case 子串匹配 */
  match: (id: string) => boolean;
  capability: Partial<
    Pick<ModelCapability, 'tools' | 'vision' | 'reasoning' | 'jsonMode' | 'stt' | 'tts'>
  >;
}

const RULES: CapabilityRule[] = [
  // —— Reasoning 模型（一般不支持 tools/vision，单独走思维链） ——
  {
    match: (id) =>
      /^o1(-|$)/.test(id) ||
      /^o3(-|$)/.test(id) ||
      id.includes('deepseek-reasoner') ||
      id.includes('deepseek-r1') ||
      id.includes('qwq') ||
      id.includes('qwen3-reasoning') ||
      /\bthinking\b/.test(id),
    capability: { reasoning: true },
  },

  // —— Vision 模型 ——
  {
    match: (id) =>
      id.includes('gpt-4o') ||
      id.includes('gpt-4-vision') ||
      id.includes('gpt-4-turbo') ||
      id.includes('gpt-5') ||
      id.includes('claude-3') ||
      id.includes('claude-4') ||
      id.includes('claude-sonnet') ||
      id.includes('claude-opus') ||
      id.includes('claude-haiku') ||
      id.includes('gemini-1.5') ||
      id.includes('gemini-2') ||
      id.includes('gemini-pro-vision') ||
      id.includes('llava') ||
      id.includes('qwen-vl') ||
      id.includes('qwen2-vl') ||
      id.includes('qwen2.5-vl') ||
      id.includes('deepseek-vl') ||
      id.includes('internvl') ||
      id.includes('minicpm-v') ||
      id.includes('pixtral'),
    capability: { vision: true },
  },

  // —— Tools / Function calling ——
  {
    match: (id) =>
      id.includes('gpt-4') ||
      id.includes('gpt-3.5-turbo') ||
      id.includes('gpt-5') ||
      id.includes('claude-3') ||
      id.includes('claude-4') ||
      id.includes('claude-sonnet') ||
      id.includes('claude-opus') ||
      id.includes('claude-haiku') ||
      id.includes('gemini-1.5') ||
      id.includes('gemini-2') ||
      id.includes('gemini-pro') ||
      id.includes('deepseek-chat') ||
      id.includes('deepseek-coder') ||
      id.includes('deepseek-v3') ||
      id.includes('llama-3') ||
      id.includes('llama3') ||
      id.includes('mistral-large') ||
      id.includes('mistral-medium') ||
      id.includes('mistral-small') ||
      id.includes('mixtral') ||
      id.includes('qwen2.5') ||
      id.includes('qwen3') ||
      id.includes('command-r') ||
      id.includes('command-a') ||
      id.includes('grok-2') ||
      id.includes('grok-3'),
    capability: { tools: true },
  },

  // —— JSON mode（OpenAI 系，多数 OpenAI-compat 也支持） ——
  {
    match: (id) =>
      id.includes('gpt-4') ||
      id.includes('gpt-3.5-turbo') ||
      id.includes('gpt-5') ||
      id.includes('deepseek-chat') ||
      id.includes('deepseek-v3'),
    capability: { jsonMode: true },
  },

  // —— STT (Speech-to-Text) ——
  {
    match: (id) => id.includes('whisper-1') || id === 'whisper-1',
    capability: { stt: true },
  },

  // —— TTS (Text-to-Speech) ——
  {
    match: (id) => id.includes('tts-1') || id === 'tts-1' || id === 'tts-1-hd',
    capability: { tts: true },
  },
];

/**
 * 根据 modelId / display 推断默认 ModelCapability。
 *
 * @param idOrName  模型 id 或 name；空串/未知都按"基础流式"返回
 * @returns         始终包含 streaming:true；其它字段按规则补齐
 */
export function inferModelCapability(idOrName: string): ModelCapability {
  const lower = idOrName.toLowerCase();
  const cap: ModelCapability = { streaming: true };
  for (const rule of RULES) {
    if (rule.match(lower)) {
      Object.assign(cap, rule.capability);
    }
  }
  return cap;
}

/**
 * 合并 provider 自报 capability + 推断结果。
 * provider 显式声明的字段优先；其它字段用推断兜底。
 */
export function mergeCapability(
  reported: Partial<ModelCapability> | undefined | null,
  idOrName: string,
): ModelCapability {
  const inferred = inferModelCapability(idOrName);
  return { ...inferred, ...(reported ?? {}) };
}
