/**
 * ProviderRegistry：按 kind 查找 ProviderFactory
 *
 * 具体实现（openai.ts / anthropic.ts / ...）在其 module 级别调用 `registerProviderFactory`
 * 把自己注册进来。上层通过 kind 拿到 factory，再传入 Ports 得到 ChatProvider 实例。
 */
import type { ProviderFactory } from './types.js';

const registry = new Map<string, ProviderFactory>();

export function registerProviderFactory(kind: string, factory: ProviderFactory): void {
  registry.set(kind, factory);
}

export function getProviderFactory(kind: string): ProviderFactory | undefined {
  return registry.get(kind);
}

export function listProviderKinds(): string[] {
  return [...registry.keys()];
}

/** 仅用于测试：清空注册表 */
export function _resetProviderRegistry(): void {
  registry.clear();
}
