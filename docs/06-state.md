# 06 · 状态管理（Jotai）

本文定义 XiabaoAI 前端状态管理的原子设计、派生策略、持久化、跨端共享与调试。

## 1. 总原则

- **所有 UI 状态用 Jotai 原子**，不引入第二套状态库
- **服务端状态**（来自 IPC/tRPC 的数据）用 **jotai-tanstack-query** 或手写 `loadable` 原子管理
- **状态分层**：`base → derived → persisted → async`
- **按领域切分文件**：`atoms/conversations.ts`、`atoms/messages.ts`、`atoms/ui.ts` …
- **所有原子命名以 `Atom` 结尾**；family 以 `Family` 结尾

## 2. 目录结构

```
packages/state/
└── src/
    ├── index.ts                     # 公开 barrel
    ├── store.ts                     # createStore（可选 per-window）
    ├── adapters/
    │   └── storageAdapter.ts        # 把 StoragePort 包装成 Jotai atomWithStorage 所需 interface
    ├── atoms/
    │   ├── ui.ts                    # 主题、布局、侧栏、命令面板
    │   ├── tabs.ts                  # IDE Tab 系统
    │   ├── conversations.ts
    │   ├── messages.ts
    │   ├── streaming.ts
    │   ├── providers.ts
    │   ├── models.ts
    │   ├── presets.ts
    │   ├── search.ts
    │   ├── settings.ts
    │   ├── knowledge.ts
    │   ├── translate.ts
    │   ├── image.ts
    │   ├── agent.ts
    │   ├── mcp.ts
    │   ├── sync.ts
    │   └── shortcuts.ts
    ├── selectors/
    │   ├── conversations.ts         # 复杂派生（分组、排序）
    │   └── messages.ts              # 线性消息（考虑分叉树）
    └── effects/
        ├── ipcBridge.ts             # 订阅 tRPC 数据反向写入 atom
        └── shortcuts.ts             # 键盘快捷键监听
```

## 3. 基础原子模式

### 3.1 普通原子

```ts
// packages/state/src/atoms/ui.ts
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const sidebarCollapsedAtom = atom(false);
export const conversationListWidthAtom = atom(260);
export const commandPaletteOpenAtom = atom(false);
```

### 3.2 持久化原子（atomWithStorage + 自定义 storage）

由于 `packages/state` 不得直接依赖平台 API，我们把 `StoragePort.kv*` 包装成 Jotai storage：

```ts
// packages/state/src/adapters/storageAdapter.ts
import type { SyncStorage } from 'jotai/vanilla/utils/atomWithStorage';
import type { StoragePort } from '@xiabao/core';

export function jotaiKvAdapter(port: StoragePort, prefix = 'ui:'): SyncStorage<unknown> {
  // Note: Jotai SyncStorage 实际上是异步也 OK；用户选 SyncStorage 类型以便 SSR 不闪烁
  return {
    getItem: (key, initial) => {
      // 懒加载：首次读取时从 port，之后使用 Jotai 内部缓存
      throw new Promise(async (resolve) => {
        const v = await port.kvGet(prefix + key);
        resolve(v == null ? initial : JSON.parse(v));
      });
    },
    setItem: (key, value) => {
      void port.kvSet(prefix + key, JSON.stringify(value));
    },
    removeItem: (key) => {
      void port.kvDelete(prefix + key);
    },
    subscribe: (key, callback, initial) => {
      // 可选：libsql 同步侧变更推送
      return () => {};
    },
  };
}
```

使用：

```ts
// packages/state/src/atoms/settings.ts
import { atomWithStorage } from 'jotai/utils';
import { jotaiKvAdapter } from '../adapters/storageAdapter';

export function createSettingsAtoms(port: StoragePort) {
  const s = jotaiKvAdapter(port, 'settings:');
  return {
    themeAtom: atomWithStorage<'light' | 'dark' | 'system'>('theme', 'system', s),
    accentAtom: atomWithStorage<'green' | 'blue' | 'purple' | 'orange' | 'pink' | 'gray'>(
      'accent',
      'green',
      s,
    ),
    densityAtom: atomWithStorage<'comfortable' | 'compact'>('density', 'comfortable', s),
    fontSizeAtom: atomWithStorage<'sm' | 'md' | 'lg'>('fontSize', 'md', s),
    localeAtom: atomWithStorage<string>('locale', 'system', s),
    defaultModelAtom: atomWithStorage<string>('defaultModel', 'openai:gpt-4o-mini', s),
  };
}
```

Renderer 启动时注入：

```ts
// apps/desktop/src/renderer/store.ts
import { Provider as JotaiProvider } from 'jotai';
import { createStore } from 'jotai/vanilla';
import { createSettingsAtoms } from '@xiabao/state';
import { trpc } from './trpc';

const port = makeTrpcStorageBridge(trpc); // 把 trpc.settings.get/set 包装成 StoragePort
export const settings = createSettingsAtoms(port);
export const store = createStore();
```

### 3.3 派生原子

```ts
// packages/state/src/atoms/conversations.ts
export const conversationsAtom = atom<Conversation[]>([]);
export const activeConvIdAtom = atomWithStorage<string | null>('activeConv', null, storage);

export const activeConversationAtom = atom((get) => {
  const id = get(activeConvIdAtom);
  if (!id) return null;
  return get(conversationsAtom).find((c) => c.id === id) ?? null;
});

// 分组：今天 / 本周 / 本月 / 更早 / 归档
export const groupedConversationsAtom = atom((get) => {
  const list = get(conversationsAtom);
  return groupByDate(list);
});
```

### 3.4 atomFamily：按 ID 派生

```ts
// packages/state/src/atoms/messages.ts
import { atomFamily } from 'jotai/utils';
import { atom } from 'jotai';

/** 每个会话的消息列表（线性化后的，非分叉树） */
export const messagesFamily = atomFamily((convId: string) => atom<Message[]>([]));

/** 每个会话当前选中的分支路径 */
export const branchPathFamily = atomFamily((convId: string) =>
  atom<Record<string /*parentId*/, number /*variantIndex*/>>({}),
);

/** 分叉树根据 branchPath + 全部消息派生出展示顺序 */
export const displayMessagesFamily = atomFamily((convId: string) =>
  atom((get) => {
    const all = get(messagesFamily(convId));
    const path = get(branchPathFamily(convId));
    return linearizeTree(all, path); // 纯函数
  }),
);
```

`atomFamily` 会对相同参数返回同一 atom 实例，不会泄漏（可用 `.setShouldRemove` 做淘汰）。

### 3.5 流式状态（streamingAtom）

```ts
// packages/state/src/atoms/streaming.ts
export interface StreamingState {
  text: string; // 文本累加
  reasoning?: string; // Claude extended thinking 累加
  toolCalls: Record<string, { name: string; argsPartial: string; result?: unknown }>;
  startedAt: number;
  tokensIn?: number;
  tokensOut?: number;
}

/** msgId → streaming 状态；消息结束后 delete */
export const streamingAtom = atom<Record<string, StreamingState>>({});

/** 写入 delta 的辅助 action atom */
export const appendTextDeltaAtom = atom(null, (get, set, p: { msgId: string; delta: string }) => {
  const cur = get(streamingAtom);
  const s = cur[p.msgId] ?? { text: '', toolCalls: {}, startedAt: Date.now() };
  set(streamingAtom, { ...cur, [p.msgId]: { ...s, text: s.text + p.delta } });
});
```

### 3.6 异步原子（loadable）

用于"一次性拉取 + 显示加载态"的数据，如 provider 列表：

```ts
// packages/state/src/atoms/providers.ts
import { loadable } from 'jotai/utils';

export const providersRawAtom = atom(async (get) => {
  // 外部在 renderer 里注入 trpc client，这里用 service atom
  const trpc = get(trpcClientAtom);
  return trpc.providers.list.query();
});

export const providersLoadableAtom = loadable(providersRawAtom);
// UI: const state = useAtomValue(providersLoadableAtom);
//     state.state === 'loading' / 'hasData' / 'hasError'
```

## 4. IDE Tab 状态

这是桌面端独有且复杂的状态，单独详细：

```ts
// packages/state/src/atoms/tabs.ts
export interface TabItem {
  id: string; // TabItem 自己的 id
  kind: 'conversation' | 'translate' | 'image' | 'agent' | 'settings' | 'knowledge';
  refId: string | null; // 对应资源 id（如 convId）
  title: string;
  icon?: string;
  dirty?: boolean; // 未保存
  pinned?: boolean;
}

export interface TabGroup {
  id: string;
  tabs: TabItem[];
  activeTabId: string | null;
}

export interface SplitLayout {
  kind: 'single' | 'h-split' | 'v-split';
  groups: TabGroup[]; // 1 或 2（一级分屏）
  ratios?: number[]; // 分屏比例
}

export const layoutAtom = atomWithStorage<SplitLayout>(
  'ide.layout',
  {
    kind: 'single',
    groups: [{ id: 'g1', tabs: [], activeTabId: null }],
  },
  storage,
);

/** Actions */
export const openTabAtom = atom(null, (get, set, t: Omit<TabItem, 'id'>) => {
  // 若已有相同 kind+refId 的 Tab → 激活
  // 否则追加到当前 active group
});

export const closeTabAtom = atom(null, (get, set, tabId: string) => {
  // 从 group 中移除；若空则关闭 group（或保持 placeholder）
});

export const splitTabAtom = atom(
  null,
  (get, set, p: { tabId: string; direction: 'right' | 'down' }) => {
    // 把 tab 拖到分屏位
  },
);

export const detachTabAtom = atom(null, (get, set, tabId: string) => {
  // 拖出独立窗口（发 tRPC 让 Main 开新窗口）
});
```

独立窗口的状态同步：每个窗口有自己的 Jotai store，但通过 tRPC subscription 接收"跨窗口事件"（如另一窗口编辑了会话标题，所有窗口更新）。

## 5. 订阅 tRPC → 写 atom（ipcBridge effect）

```ts
// packages/state/src/effects/ipcBridge.ts
export function bindIpcBridge(store: JotaiStore, trpc: TrpcClient) {
  // 初始拉取
  trpc.conversations.list.query({}).then((list) => {
    store.set(conversationsAtom, list);
  });

  // 订阅 service-side 的领域事件（Main emit）
  trpc.app.events.subscribe(undefined, {
    onData: (ev) =>
      match(ev)
        .with({ kind: 'conversation-updated' }, ({ conversation }) => {
          store.set(conversationsAtom, (prev) =>
            prev.map((c) => (c.id === conversation.id ? conversation : c)),
          );
        })
        .with({ kind: 'message-appended' }, ({ convId, message }) => {
          store.set(messagesFamily(convId), (prev) => [...prev, message]);
        })
        // ...
        .exhaustive(),
  });
}
```

## 6. useChat Hook（消费层封装）

```ts
// packages/ui/src/hooks/useChat.ts
export function useChat(convId: string) {
  const messages = useAtomValue(displayMessagesFamily(convId));
  const streaming = useAtomValue(streamingAtom);
  const trpc = useTrpc();

  const send = useCallback(
    async (parts: MessagePart[], opts?: SendOptions) => {
      const sub = trpc.messages.send.subscribe(
        { convId, parts, options: opts },
        {
          onData: (ev) => store.set(applyStreamEventAtom, ev),
          onError: (err) => toast.error(err.message),
          onComplete: () => store.set(clearStreamingAtom, convId),
        },
      );
      return () => sub.unsubscribe();
    },
    [convId],
  );

  const abort = useCallback(
    (msgId: string) => trpc.messages.abort.mutate({ messageId: msgId }),
    [],
  );
  const retry = useCallback(
    (msgId: string) => trpc.messages.retry.mutate({ messageId: msgId }),
    [],
  );
  const switchBranch = useCallback(
    (msgId: string) => trpc.messages.switchBranch.mutate({ messageId: msgId }),
    [],
  );

  return { messages, streaming, send, abort, retry, switchBranch };
}
```

## 7. 跨端共享

### Desktop / Web

两端都跑浏览器渲染 + React + Jotai，**`packages/state` 100% 共享**。区别仅在注入的 `trpcClient` 与 `StoragePort`：

- Desktop: `trpcClient = electron-trpc ipcLink`
- Web: `trpcClient = 直接调 core.services`（无 IPC）；storage = Dexie KV

为了统一接口，Web 端也构造一个"**Core 客户端**"包装成 `trpc`-shape：

```ts
// apps/web/src/trpc-like.ts
export function makeWebTrpcLike(core: Core): TrpcClient {
  return {
    conversations: {
      list: { query: (input) => core.services.conversation.list(input) },
      // ...
    },
    messages: {
      send: {
        subscribe: (input, cb) => {
          const controller = new AbortController();
          core.services.chat
            .send({ ...input, signal: controller.signal, onEvent: cb.onData })
            .then(() => cb.onComplete?.())
            .catch((err) => cb.onError?.(err));
          return { unsubscribe: () => controller.abort() };
        },
      },
      // ...
    },
  };
}
```

UI 代码一行不变。

### RN

RN 也用 Jotai，但 `packages/ui-native` 提供 RN 版组件。核心原子依然复用 `packages/state`。

**差异点**：

- Tab 系统在 RN 上**不使用**（降级为单屏 + 抽屉导航），所以 `layoutAtom` 在 RN 初始化时设成 `single` 并禁用 split
- `atomWithStorage` 的 storage adapter 由 op-sqlite KV 提供

## 8. 持久化矩阵

| 原子类型                 | Desktop                     | Web          | RN           |
| ------------------------ | --------------------------- | ------------ | ------------ |
| UI 偏好（主题/密度）     | better-sqlite3 KV           | IndexedDB KV | op-sqlite KV |
| 布局（layout, tab 打开） | 同上（加密）                | 同上         | 同上         |
| 最近打开                 | 同上                        | 同上         | 同上         |
| 搜索历史                 | 同上                        | 同上         | 同上         |
| Conversation / Message   | 通过 tRPC query + atom 缓存 | 直接 core    | 直接 core    |

Jotai 端缓存不承担"真相源"角色；真相在 SQLite。atom 只是内存镜像，**刷新/重启需要重新拉取**（由 bridge effect 负责）。

## 9. 性能考量

### 9.1 细粒度订阅

Jotai 天然细粒度，但要注意：

- **别把大列表整个 atom 化后全渲**。用 `@tanstack/react-virtual` + `selectAtom`：

```ts
const messageAtIndex = selectAtom(
  messagesFamily(convId),
  (list) => list[index],
  // 浅比较，可以改 deep
);
```

- **流式 delta 不要触发 list 重算**：把 `streamingAtom[msgId]` 与 `messagesFamily(convId)` 解耦，仅流中气泡订阅 streaming。

### 9.2 批量更新

使用 `store.set(atom, (prev) => ...)` 批量写，React 自动批处理。多原子连续写用：

```ts
store.set(conversationsAtom, newList);
store.set(activeConvIdAtom, newList[0].id);
// React 18 自动 batch
```

### 9.3 atomFamily 泄漏防护

```ts
messagesFamily.setShouldRemove((createdAt, convId) => {
  // 30 分钟未访问的 family 条目清除
  return Date.now() - createdAt > 30 * 60_000;
});
```

## 10. 调试

```ts
// apps/desktop/src/renderer/devtools.tsx
import { useAtomsDevtools } from 'jotai-devtools';

export function AtomsDevTools() {
  useAtomsDevtools('xiabaoai', { store });
  return null;
}

// 仅 dev 模式加载
{import.meta.env.DEV && <AtomsDevTools />}
```

Jotai DevTools 在 React DevTools 面板内显示原子依赖图与当前值。

## 11. 测试

- 纯派生原子：直接 `const store = createStore(); store.get(atom)` 断言
- 含 IPC 的原子：用 MSW 或内存 trpc mock
- Hook 级：`@testing-library/react-hooks` + Jotai Provider

示例：

```ts
test('groupedConversations', () => {
  const store = createStore();
  store.set(conversationsAtom, [
    { id: '1', updatedAt: today, ... },
    { id: '2', updatedAt: lastWeek, ... },
  ]);
  expect(store.get(groupedConversationsAtom).today).toHaveLength(1);
});
```

## 12. 全量原子清单（速查）

| 领域          | 原子                            | 类型                            | 持久化     |
| ------------- | ------------------------------- | ------------------------------- | ---------- | --------- | --- |
| **UI**        | `themeAtom`                     | `'light'                        | 'dark'     | 'system'` | ✅  |
|               | `accentAtom`                    | `'green'                        | ...`       | ✅        |
|               | `densityAtom`                   | `'comfortable'                  | 'compact'` | ✅        |
|               | `fontSizeAtom`                  | `'sm'                           | 'md'       | 'lg'`     | ✅  |
|               | `localeAtom`                    | `string`                        | ✅         |
|               | `sidebarCollapsedAtom`          | `boolean`                       | ✅         |
|               | `commandPaletteOpenAtom`        | `boolean`                       | —          |
| **Tabs**      | `layoutAtom`                    | `SplitLayout`                   | ✅         |
|               | `dragTabAtom`                   | `TabItem                        | null`      | —         |
| **Conv**      | `conversationsAtom`             | `Conversation[]`                | —          |
|               | `activeConvIdAtom`              | `string                         | null`      | ✅        |
|               | `activeConversationAtom`        | derived                         | —          |
|               | `groupedConversationsAtom`      | derived                         | —          |
| **Msg**       | `messagesFamily(convId)`        | `Message[]`                     | —          |
|               | `branchPathFamily(convId)`      | `Record<string, number>`        | —          |
|               | `displayMessagesFamily(convId)` | derived                         | —          |
| **Stream**    | `streamingAtom`                 | `Record<msgId, StreamingState>` | —          |
| **Providers** | `providersLoadableAtom`         | loadable                        | —          |
|               | `modelsByProviderFamily(id)`    | async                           | —          |
|               | `currentModelIdAtom`            | `string`                        | ✅         |
| **Presets**   | `presetsAtom`                   | `Preset[]`                      | —          |
| **Search**    | `searchQueryAtom`               | `string`                        | —          |
|               | `searchResultsAtom`             | async                           | —          |
|               | `searchScopeAtom`               | `'current'                      | 'all'`     | ✅        |
| **KB**        | `knowledgeBasesAtom`            | `KnowledgeBase[]`               | —          |
|               | `activeKbIdAtom`                | `string                         | null`      | ✅        |
| **Translate** | `translateSourceAtom`           | `string`                        | —          |
|               | `translateTargetAtom`           | `string`                        | —          |
|               | `translateLangsAtom`            | `[from,to]`                     | ✅         |
| **Image**     | `imageHistoryAtom`              | `ImageGeneration[]`             | —          |
| **Agent**     | `activeAgentRunIdAtom`          | `string                         | null`      | —         |
|               | `agentStepsFamily(runId)`       | `AgentStep[]`                   | —          |
|               | `agentPanelModeAtom`            | `'cards'                        | 'split'    | 'canvas'` | ✅  |
| **MCP**       | `mcpServersAtom`                | `McpServer[]`                   | —          |
| **Sync**      | `syncEnabledAtom`               | `boolean`                       | ✅         |
|               | `syncStatusAtom`                | `SyncStatus`                    | —          |
| **Shortcuts** | `shortcutMapAtom`               | `Record<string, Keybinding>`    | ✅         |
