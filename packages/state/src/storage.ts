/**
 * @xiabao/state · 持久化 storage 适配层
 *
 * 把所有持久化 atom 的底层 string storage 抽象为模块级单例，宿主在启动时注入：
 *
 * - **桌面 / Web**：默认 `localStorage`（不需要注入，开箱即用）
 * - **mobile (RN)**：在 `apps/mobile` 启动时调 `setPersistStringStorage(mmkvAdapter)`
 *   （推荐 `react-native-mmkv` 的同步 API；若用 `@react-native-async-storage/async-storage`
 *   则需要 atom 类型升级为 async，不在本期范围内）
 * - **Node 测试**：自动 fallback 到内存 Map，避免单测 throw
 *
 * 设计要点：
 *
 * 1. **运行时可切换**：每个 atom 通过 `createJSONStorage(() => stringStorage)` lazy 引用，
 *    宿主何时注入都生效（但已 init 的 atom 不会重新读初始值，所以注入应在 atom 首次读之前）
 * 2. **默认零侵入**：桌面端未注入时走 localStorage，与历史行为完全一致
 * 3. **类型安全**：每次 `createPersistedAtom<T>` 创建独立的 JSONStorage<T>，避免 `as any`
 *
 * 详见 `docs/p10-mobile-strategy.md` §3 持久化策略。
 */

import { atomWithStorage, createJSONStorage } from 'jotai/utils';

/**
 * 与 jotai `SyncStringStorage` 同形：localStorage / MMKV 都符合此契约。
 * 只要求 sync 字符串读写；async（AsyncStorage）会让 atom 升级为 promise，
 * 当前桌面 / mobile 两端都用同步 storage（localStorage / MMKV）。
 */
export interface PersistStringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 测试 / 无 storage 环境下的内存兜底（避免 SSR / 单测 throw）。 */
const memoryStorage: PersistStringStorage = (() => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
})();

function detectDefaultStorage(): PersistStringStorage {
  if (typeof globalThis !== 'undefined') {
    const ls = (globalThis as { localStorage?: PersistStringStorage }).localStorage;
    if (ls && typeof ls.getItem === 'function') return ls;
  }
  return memoryStorage;
}

let activeStringStorage: PersistStringStorage = detectDefaultStorage();

/**
 * 注入自定义 string storage。**必须在 atom 首次读之前调用**（一般在宿主入口 main.tsx
 * 顶部，import @xiabao/state 之前的副作用模块里执行）。
 *
 * @example
 * // apps/mobile/src/storage.ts
 * import { MMKV } from 'react-native-mmkv';
 * import { setPersistStringStorage } from '@xiabao/state';
 *
 * const mmkv = new MMKV();
 * setPersistStringStorage({
 *   getItem: (k) => mmkv.getString(k) ?? null,
 *   setItem: (k, v) => mmkv.set(k, v),
 *   removeItem: (k) => mmkv.delete(k),
 * });
 */
export function setPersistStringStorage(storage: PersistStringStorage): void {
  activeStringStorage = storage;
}

/** 内部测试用：重置回 localStorage / memory 默认。生产代码勿调。 */
export function resetPersistStringStorage(): void {
  activeStringStorage = detectDefaultStorage();
}

/**
 * 创建持久化 atom。等价于 jotai `atomWithStorage(key, initial, jsonStorage)`，
 * 但底层 string storage 走我们模块级单例 → 宿主可注入。
 *
 * 桌面端未注入 → 自动 localStorage（与历史行为完全一致）。
 * mobile 端启动时注入 MMKV → 同一份代码自动走 MMKV。
 */
export function createPersistedAtom<T>(key: string, initialValue: T) {
  return atomWithStorage<T>(
    key,
    initialValue,
    createJSONStorage<T>(() => activeStringStorage),
  );
}
