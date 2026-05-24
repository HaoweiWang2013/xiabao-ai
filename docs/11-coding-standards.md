# 11 · 代码规范

本文定义 XiabaoAI 的编码规范、命名约定、组件模式、错误处理、测试、Commit / PR 流程。所有贡献者必须遵守。

## 1. 基本原则

- **TypeScript strict**：不允许 `any`（除非注释 `// @allow-any <reason>`）
- **无副作用的 import**：顶层 import 不得有可观察副作用
- **早返回**：多层嵌套 → 早返回 / guard clause
- **纯函数优先**：业务逻辑能纯则纯
- **不要追求 clever**：宁可多写 3 行明白代码，也不要 1 行绝活
- **小函数**：单个函数 < 40 行为目标
- **Dependency Injection**：不要 `new XxxClient()` 直接在业务层；由组装点传入

## 2. 命名

| 种类            | 约定                          | 示例                                    |
| --------------- | ----------------------------- | --------------------------------------- |
| 包名            | kebab-case + `@xiabao/` scope | `@xiabao/core`                          |
| 文件名          | kebab-case                    | `chat-service.ts`, `message-bubble.tsx` |
| 目录名          | kebab-case                    | `providers/`, `agents/`                 |
| React 组件      | PascalCase                    | `MessageBubble`, `TabBar`               |
| Hook            | camelCase + `use` 前缀        | `useChat`, `useProviders`               |
| Jotai atom      | camelCase + `Atom` 后缀       | `conversationsAtom`, `themeAtom`        |
| Jotai family    | 同上 + `Family`               | `messagesFamily`                        |
| 类              | PascalCase                    | `ChatService`, `OpenAIProvider`         |
| 类型 / 接口     | PascalCase（不加 `I` 前缀）   | `Conversation`, `Provider`              |
| 枚举常量        | SCREAMING_SNAKE_CASE          | `MAX_STEPS`, `DEFAULT_TIMEOUT_MS`       |
| 局部变量 / 参数 | camelCase                     | `convId`, `modelList`                   |
| 布尔变量        | `is` / `has` / `should` 前缀  | `isLoading`, `hasAttachment`            |
| 事件 handler    | `on` / `handle` 前缀          | `onSubmit`, `handleKeyDown`             |
| 动作（action）  | 动词开头                      | `sendMessage`, `deleteConversation`     |
| 测试文件        | 跟源码同目录 + `.test.ts`     | `chat-service.test.ts`                  |
| e2e 测试        | `*.e2e.ts`，放 `e2e/`         | `send-message.e2e.ts`                   |

## 3. 文件组织

### 每个包的规约

```
packages/xxx/
├── src/
│   ├── index.ts              # 唯一 public barrel
│   ├── <domain>/
│   │   ├── <domain>.ts       # 主要 class/function
│   │   ├── <domain>.types.ts # 类型
│   │   └── <domain>.test.ts  # 测试
│   └── util/                 # 纯工具
├── package.json
├── tsconfig.json
└── README.md                 # 给库使用者的说明
```

### Barrel 原则

```ts
// ✅ src/index.ts 只重导出公共 API
export { ChatService } from './services/chat';
export type { ChatMessage, StreamEvent } from './services/chat/types';

// ❌ 不要 export *（破坏 tree-shaking + 泄漏内部）
// ❌ 不要跨子目录深层 import
```

## 4. TypeScript 惯例

### 4.1 类型 vs 接口

- **类型优先用 `type`**；需要被 `implements` 或 `extends` 时用 `interface`
- **API 公共类型**尽量用 `interface`（可扩展）

```ts
// 一般
export type Conversation = { id: string; title: string; ... };

// 需要被 class implement
export interface Provider {
  stream(input: ChatStreamInput): AsyncIterable<StreamEvent>;
}
```

### 4.2 禁用项

```ts
// ❌ any
function foo(x: any) { ... }

// ❌ 非空断言 !（除非能证明不可能 null）
const v = arr.find(x => x.id === id)!;

// ❌ as 断言（除非兜底 & 有注释）
const c = data as Conversation;    // 应先 zod 验证

// ❌ Enum（偏爱 union literal）
enum Role { User, Assistant }       // ✗
type Role = 'user' | 'assistant';   // ✓
```

### 4.3 导入顺序

```ts
// 1. node:*
import fs from 'node:fs/promises';

// 2. 第三方
import { z } from 'zod';
import { observable } from '@trpc/server/observable';

// 3. @xiabao/*
import { ChatService } from '@xiabao/core';
import { Button } from '@xiabao/ui';

// 4. 本包相对
import { buildContext } from './context';
import type { SendInput } from './types';
```

由 ESLint `import/order` 自动排。

### 4.4 异常

- 业务错误用 `AppError`（见 `05-ipc-api.md` 第 6 节）
- 底层错误捕获后**包装**为 `AppError` 再上抛
- 不要吞异常（`try { ... } catch {}` 禁用；必要时加 `// @ignore-err <reason>`）

```ts
try {
  await provider.stream(input);
} catch (err) {
  throw new AppError('PROVIDER_ERROR', 'Stream failed', err, {
    providerId: provider.id,
    modelId: input.modelId,
  });
}
```

## 5. React 组件规范

### 5.1 函数组件 + 显式 props 类型

```ts
interface MessageBubbleProps {
  message: Message;
  onRetry?: (id: string) => void;
  className?: string;
}

export function MessageBubble({ message, onRetry, className }: MessageBubbleProps) {
  // ...
}
```

- **不用** `React.FC`（丢失 children 推导）
- `children` 显式类型：`children: React.ReactNode`

### 5.2 不滥用 `useEffect`

优先：

1. 派生值用计算或 selector atom
2. 事件处理在 handler 内
3. 只在"订阅外部数据"或"DOM 副作用"时用 `useEffect`

```ts
// ❌ 用 effect 计算派生
const [fullName, setFullName] = useState('');
useEffect(() => setFullName(`${first} ${last}`), [first, last]);

// ✅ 直接算
const fullName = `${first} ${last}`;
```

### 5.3 Memo / useMemo / useCallback

不无脑加。**只对真正有性能问题的** 加。默认 **不加**。

例外：传给被 `React.memo` 包裹的子组件的 callback；大计算量的派生。

### 5.4 样式（Tailwind）

```tsx
// ✅ cva + tailwind-merge
const buttonVariants = cva('inline-flex items-center justify-center rounded-lg transition-colors', {
  variants: {
    variant: { primary: 'bg-green-500 text-white', ghost: 'hover:bg-zinc-100' },
    size: { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

export function Button({ variant, size, className, ...rest }: Props) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...rest} />;
}
```

- **不要**用 `style={{...}}`（除了动态颜色等必要情形）
- 语义色用**主题变量**（`bg-background`, `text-foreground`），不要硬编码 `bg-zinc-800`
- 主色统一用 `green-500/600`，避免随意改色

### 5.5 可访问性

- 每个可交互元素 → 有 `aria-*` 或原生语义
- 按钮一定用 `<button type="button">`
- 输入框有 `<label>`（显式或 `aria-label`）
- 色彩对比度 AA

### 5.6 状态提升原则

- 组件内部状态用 `useState`
- 两个以上组件共享 → Jotai atom
- 整个 App 共享 → 放 `packages/state`

## 6. Jotai 规范

- atom 命名 `xxxAtom`
- 派生 atom 的 `get` 参数命名 `get`
- action atom 第一参数传 `null`：`atom(null, (get, set, payload) => ...)`
- **不要**在组件内 `atom(...)` 创建（会每次重建）；除非用 `useMemo`
- atomFamily 的 key 必须是可稳定序列化的（string / number / tuple）

## 7. 异步

- **优先 async/await**，少用 `.then`
- **取消**：一律通过 `AbortSignal`；函数有异步副作用必须接受 `signal`
- 并发：`Promise.all` / `p-limit` / `p-queue`
- 不要空 catch；不要 `await Promise.all([a, b])` 后忽略某个结果
- 流：返回 `AsyncIterable` > `ReadableStream` > EventEmitter

## 8. 错误处理

```ts
// Service 层
export class ChatService {
  async send(...) {
    try {
      // ...
    } catch (err) {
      this.deps.logger.error('chat.send failed', { err, convId });
      throw err instanceof AppError ? err : new AppError('UNKNOWN', String(err), err);
    }
  }
}

// Renderer 层
try {
  await trpc.messages.send.subscribe(...);
} catch (err) {
  match(err)
    .with({ data: { appCode: 'RATE_LIMIT' } }, () => showToast('频率太高，稍后重试'))
    .with({ data: { appCode: 'NETWORK' } }, () => showBanner('离线了'))
    .otherwise(() => showError(err));
}
```

## 9. 日志

- 使用 `LoggerPort`（不要 `console.log` 在业务代码）
- **结构化**：`logger.info('message', { convId, modelId })`，而不是拼字符串
- 等级：
  - `debug` 开发流水账
  - `info` 关键业务里程碑（启动、连接、发送）
  - `warn` 可恢复异常（重试成功、降级）
  - `error` 真正错误
- **不要** log 任何 API Key / passphrase / 用户输入内容（仅长度/哈希）

## 10. 测试

### 覆盖率目标

- `packages/core` 单元覆盖率 ≥ **80%**
- `packages/state` ≥ **70%**
- `packages/ui` 组件 snapshot + 关键交互测试
- `apps/desktop` e2e 覆盖 M2 黄金路径：启动 → 新建会话 → 发送 → 重试 → 关闭

### 单元测试

```ts
// chat-service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ChatService } from './chat-service';
import { InMemoryStoragePort, FakeHttpPort } from '@xiabao/testing';

describe('ChatService.send', () => {
  it('streams assistant text', async () => {
    const storage = new InMemoryStoragePort();
    const http = new FakeHttpPort([
      { kind: 'text-delta', delta: 'Hello' },
      { kind: 'text-delta', delta: ' world' },
      { kind: 'finish', reason: 'stop' },
    ]);
    const svc = new ChatService(makeRepos({ storage }), { storage, http, ... });

    const events: StreamEvent[] = [];
    await svc.send({ convId: 'c1', parts: [{kind:'text', text:'hi'}], onEvent: e => events.push(e) });

    expect(events.find(e => e.kind === 'finish')).toBeDefined();
    const deltas = events.filter(e => e.kind === 'text-delta').map(e => e.delta).join('');
    expect(deltas).toBe('Hello world');
  });
});
```

### 组件测试

```tsx
// message-bubble.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('retry clicks call onRetry', async () => {
  const onRetry = vi.fn();
  render(<MessageBubble message={fakeMsg} onRetry={onRetry} />);
  await userEvent.hover(screen.getByRole('article'));
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(onRetry).toHaveBeenCalledWith(fakeMsg.id);
});
```

### E2E

```ts
// apps/desktop/e2e/send-message.e2e.ts
import { test, expect, _electron } from '@playwright/test';

test('send and receive streamed reply', async () => {
  const app = await _electron.launch({ args: ['.'] });
  const page = await app.firstWindow();
  await page.getByPlaceholder('Type a message').fill('hello');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-msg-role=assistant]')).toContainText(/./, { timeout: 15_000 });
  await app.close();
});
```

### 禁用删测试

**禁止**删除或弱化测试来让 CI 通过。如果测试真的错了，先修测试的逻辑描述，再改实现。

## 11. Commit 规范（Conventional Commits）

```
<type>(<scope>): <subject>

<body>

<footer>
```

**type**：`feat` / `fix` / `refactor` / `perf` / `test` / `docs` / `chore` / `build` / `ci` / `style` / `revert`

**scope**：包名（`core`, `ui`, `desktop`, `docs`, `state`, ...）或领域（`chat`, `agent`, `ipc`）

**subject**：小写开头，< 72 字符，祈使句（"add"，不是 "added"）

示例：

```
feat(core): add anthropic provider with streaming

- wrap @ai-sdk/anthropic in OpenAIProvider-like shape
- map extended thinking blocks to reasoning-delta events
- add unit tests for stream event translation

Closes #123
```

### Scope 列表

`core` · `ui` · `ui-native` · `state` · `theme` · `i18n` · `crypto` · `sync` ·
`desktop` · `web` · `mobile` · `web-proxy` · `docs` · `ci` · `deps` · `infra`

### breaking change

```
feat(core)!: reshape Provider.stream to return AsyncIterable

BREAKING CHANGE: Provider.stream now returns AsyncIterable<StreamEvent>
instead of Observable. Downstream consumers must use `for await` instead of
subscription-based API.
```

## 12. PR 流程

### PR 模板

```md
## What

<简要说明改了什么。一句话即可>

## Why

<为什么要改>

## How

<怎么实现的，关键决策>

## Screenshots / Videos

<UI 改动必须附>

## Checklist

- [ ] 有新增/变更 Public API → 更新 `docs/`
- [ ] 单元测试已加/更新
- [ ] e2e 未 break
- [ ] 有 changeset（如需发版）
- [ ] 无 TODO 留置（或已关联 issue）
- [ ] 无 console.log / debugger
```

### 规则

- PR 大小尽量 < 400 行
- 超大 PR 必须拆
- Draft → Ready for Review → 至少 1 approval
- CI 全绿才可合并
- 合并策略：**Squash merge**（保持 main 线性）
- 合并后若有 changeset → 自动开 Release PR

## 13. 代码审查 Checklist

审查时关注：

- [ ] 架构：是否符合 Port/Adapter 边界？跨包引用合理吗？
- [ ] 错误：所有 await 的异常都有兜底吗？向上传播了正确的 AppError？
- [ ] 性能：列表渲染用了虚拟化？流式没有整表重算？
- [ ] 安全：是否可能泄漏 API Key / 用户内容到日志？
- [ ] 测试：关键路径有测试吗？测试有效吗（不是 shadow）？
- [ ] 可读：命名是否清晰？有没有过度复杂的一行？
- [ ] 文档：Public API 改动是否同步更新文档？

## 14. 开发环境推荐

### VS Code 插件

- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Error Lens
- TypeScript Error Translator
- Conventional Commits
- Vitest Explorer
- Playwright Test for VS Code
- Code Spell Checker

### VS Code settings（项目级 `.vscode/settings.json`）

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"],
    ["cn\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"]
  ]
}
```

## 15. 不推荐的模式

- **Barrel 层过深**：`from '@xiabao/core'` 拉入 2MB 东西 → 破坏 tree-shaking
- **隐式全局**：`global.xxx` / `window.__xxx`
- **大 switch**：超过 5 个分支用 `ts-pattern`
- **魔法数**：`setTimeout(fn, 3000)` → `setTimeout(fn, DEFAULT_RETRY_MS)`
- **注释未删代码**：直接删，git 负责留痕
- **TODO 不标 owner**：`// TODO(@alice): fix sanitize on 2026-06-01`

## 16. i18n 规范

```ts
// packages/i18n/src/zh-CN/chat.json
{
  "emptyState": {
    "title": "开始一段新对话",
    "subtitle": "选个模型，问点什么"
  },
  "sendButton": "发送",
  "retry": "重试"
}

// 使用
const { t } = useTranslation('chat');
<h1>{t('emptyState.title')}</h1>
```

- **所有面向用户的文案必须走 t()**，不硬编码
- 中英文 key 共享结构
- 动态数值用 **插值**：`t('hello', { name: 'Alice' })` → "Hello Alice"

## 17. 依赖新增

新增依赖需 RFC 讨论，理由模板：

```
- 依赖名 / 版本 / License
- 解决什么问题
- 对比其他 2-3 个候选
- bundle size 影响（用 bundlephobia）
- 安全记录（npmjs.com advisories / snyk）
- 是否可替换为 n 行代码实现
```

小工具（< 50 行）优先自己写。

## 18. 性能红线

- 主进程：**任何 IPC handler 必须 < 200ms**（不包括流）
- 渲染：**首帧 < 1s，交互就绪 < 2s**
- 流：**第一字节 < 500ms**（用户期望即时反馈）
- 数据库：**单查询 < 50ms**（用索引）
- 冷启动：**< 2s**（桌面 M1 MBA）

超过红线的改动需在 PR 中说明。

## 19. 文档

- Public API 改动 → 同步改 `docs/`
- 新加模块 → 在 `docs/<n>-xxx.md` 写一章
- 变更决策 → 写进 `docs/10-roadmap.md` 的"决策日志"

## 20. 最后一条

> 有疑问时：**读代码，问团队，不猜**。
