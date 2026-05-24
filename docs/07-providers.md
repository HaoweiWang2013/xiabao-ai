# 07 · AI Provider 抽象

本文描述 XiabaoAI 的多服务商接入层：统一的 `Provider` / `Model` 接口、内置 Provider 清单、能力声明、成本估算、工具/函数调用、多模型并发、MCP 集成。

## 1. 抽象原则

- 上层（Service / UI）只面对**统一的 ChatService API**，不认具体 Provider
- 具体 Provider 基于 **Vercel AI SDK v5** 实现，但 Core 在外面包一层 `Provider` 接口，方便未来替换
- 模型能力声明化（`capability.vision`、`capability.tools` 等），UI 根据能力动态启用/禁用入口

## 2. 接口层次

```
┌────────────────────────────────────────────┐
│  UI                                        │
│  useChat().send(parts, options)            │
└────────────┬───────────────────────────────┘
             ▼
┌────────────────────────────────────────────┐
│  ChatService（Core）                       │
│  · 持久化消息 · 组装上下文 · 选 Provider   │
│  · 工具注入 · 重试/中断 · 事件流           │
└────────────┬───────────────────────────────┘
             ▼
┌────────────────────────────────────────────┐
│  Provider Adapter（Core 内，每家一个）    │
│  · 翻译成各家 API 需要的参数               │
│  · 底层走 Vercel AI SDK                   │
└────────────┬───────────────────────────────┘
             ▼
┌────────────────────────────────────────────┐
│  Vercel AI SDK                            │
│  streamText / generateObject / ...         │
└────────────┬───────────────────────────────┘
             ▼
         HttpPort → 真实 HTTP/SSE
```

## 3. `Provider` 接口

```ts
// packages/core/src/providers/types.ts
export interface Provider {
  readonly id: string; // 'openai' | 'anthropic' | ...
  readonly kind: ProviderKind;
  readonly name: string;

  listModels(): Promise<Model[]>; // 可能从 API 拉，也可能硬编码
  test(): Promise<ProviderTestResult>;

  /** 统一流式入口，所有生成能力的"一等公民" */
  stream(input: ChatStreamInput): AsyncIterable<StreamEvent>;

  /** 非流式（某些模型不支持 SSE） */
  generate?(input: ChatStreamInput): Promise<ChatResult>;

  /** 嵌入 */
  embed?(input: EmbedInput): Promise<EmbedResult>;

  /** 图像生成 */
  image?(input: ImageInput): AsyncIterable<ImageEvent>;

  /** 语音 */
  stt?(input: SttInput): AsyncIterable<SttEvent>;
  tts?(input: TtsInput): AsyncIterable<TtsEvent>;

  dispose?(): Promise<void>;
}

export type ProviderKind =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'ollama'
  | 'openrouter'
  | 'openai-compatible'
  | 'custom';

export interface ChatStreamInput {
  modelId: string;
  messages: ChatMessage[]; // 平台无关的消息数组
  system?: string;
  temperature?: number;
  topP?: number;
  maxOutput?: number;
  stopSequences?: string[];
  tools?: ToolDefinition[]; // function calling
  toolChoice?: 'auto' | 'required' | 'none' | { toolName: string };
  responseFormat?: 'text' | 'json' | { schema: JsonSchema };
  signal?: AbortSignal;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  parts: ChatPart[];
  name?: string;
  toolCallId?: string;
}

export type ChatPart =
  | { kind: 'text'; text: string }
  | { kind: 'image'; mime: string; data: Uint8Array | string /* base64 or url */ }
  | { kind: 'file'; mime: string; name: string; data: Uint8Array | string }
  | { kind: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | { kind: 'tool-result'; toolCallId: string; result: unknown; isError?: boolean };
```

## 4. `Model` 与能力声明

```ts
export interface Model {
  id: string; // 'openai:gpt-4o-mini'
  providerId: string;
  family?: string; // 'gpt-4o' | 'claude-3' | 'gemini-1.5'
  display: string;
  contextTokens?: number;
  maxOutput?: number;
  capability: ModelCapability;
  pricing?: ModelPricing;
  deprecatedAt?: number;
}

export interface ModelCapability {
  streaming: boolean;
  vision: boolean;
  audioInput: boolean;
  pdfInput: boolean;
  tools: boolean; // function calling
  parallelTools: boolean;
  jsonMode: boolean;
  structuredOutput: boolean; // responseFormat.schema
  reasoning: boolean; // o1 / DeepSeek-R1 / Claude extended thinking
  webSearch: boolean; // 原生 web search tool
  embedding: boolean;
  image: boolean; // 图像生成能力
  tts: boolean;
  stt: boolean;
  maxImages?: number;
  maxInputMb?: number;
}

export interface ModelPricing {
  inputPer1M?: number; // USD
  outputPer1M?: number;
  reasoningPer1M?: number;
  cachedInputPer1M?: number;
  imageInputPerImage?: number;
  embeddingPer1M?: number;
  currency: string; // 'USD'
}
```

UI 根据 `capability` 决定：

- 有 `vision` → 允许拖图
- 有 `tools` → 允许工具调用、MCP
- 有 `reasoning` → 显示"思考链"折叠区
- 有 `structuredOutput` → 输出格式下拉显示 "JSON Schema"

### 4.1 能力推断与手动管理（Phase 5-Pro UX-1）

并非所有 Provider 都会在 `listModels` 里自报 `capability`（OpenAI 几乎不报，Ollama 完全不报，Anthropic 部分报告）。为了让 UI 能正确启用 vision/tools 等入口，core 提供两个纯函数：

```ts
// packages/core/src/providers/capabilities.ts

/** 根据 model id（小写子串匹配）推断默认能力 */
export function inferModelCapability(idOrName: string): ModelCapability;

/** provider 自报字段优先，缺失字段用推断兜底 */
export function mergeCapability(
  reported: Partial<ModelCapability> | undefined | null,
  idOrName: string,
): ModelCapability;
```

**规则覆盖（节选）**：

| 能力        | 命中关键词                                                                           |
| ----------- | ------------------------------------------------------------------------------------ |
| `reasoning` | `o1-*` / `o3-*` / `deepseek-reasoner` / `deepseek-r1` / `qwq` / `*-thinking`         |
| `vision`    | `gpt-4o` / `gpt-5` / `claude-3/4` / `gemini-1.5/2` / `llava` / `qwen-vl` / `pixtral` |
| `tools`     | `gpt-4*` / `gpt-3.5-turbo` / `claude-*` / `gemini-pro` / `deepseek-v3` / `mixtral`   |
| `jsonMode`  | OpenAI 系 + DeepSeek-Chat / V3                                                       |

**保守原则**：拿不准给 false，用户在 UI 上勾选覆盖。

#### Provider 卡片的模型管理面板（`ModelManager`）

每个非 `local-embedder` Provider 卡片底部渲染 `ModelManager`，提供：

- **[+ 添加]**：弹 `ModelEditDialog`，手动输入 model id；失焦时自动调 `inferModelCapability` 预填能力
- **[🔍 获取模型]**：弹 `ProbeModelsDialog`，自动 `provider.probeModels`（不写库），多选后批量 `upsertModelsBulk`
- **行项**：display + 4 个能力图标（🔧 工具 / 👁️ 视觉 / 🧠 推理 / `</>` JSON）+ context tokens + max output + Switch（`setModelEnabled`）+ 编辑 + 删除

#### tRPC procedures

| Procedure                   | 类型     | 用途                             |
| --------------------------- | -------- | -------------------------------- |
| `provider.probeModels`      | mutation | 仅探测远端列表，不写库           |
| `provider.upsertModel`      | mutation | 添加/更新单个模型                |
| `provider.upsertModelsBulk` | mutation | 批量添加（来自 probe 多选）      |
| `provider.updateModel`      | mutation | 编辑显示名 / 上下文 / capability |
| `provider.setModelEnabled`  | mutation | 启用/禁用                        |
| `provider.removeModel`      | mutation | 软删（`deletedAt`）              |

详见 `docs/p5pro-model-management.md`。

## 5. 内置 Provider 清单（M1 / M2 首批）

| ID                  | 实现包                        | 支持模型示例                                               | 特性                                                          |
| ------------------- | ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| `openai`            | `@ai-sdk/openai`              | gpt-4o / gpt-4o-mini / o1 / o3 / gpt-4.5                   | tools, vision, JSON, reasoning                                |
| `anthropic`         | `@ai-sdk/anthropic`           | claude-3.5-sonnet, claude-3.5-haiku, claude-3-opus         | tools, vision, extended thinking                              |
| `google`            | `@ai-sdk/google`              | gemini-1.5-pro, gemini-1.5-flash, gemini-2.0               | tools, vision, 2M context                                     |
| `deepseek`          | `@ai-sdk/deepseek`            | deepseek-chat, deepseek-reasoner (R1)                      | reasoning, 极便宜                                             |
| `ollama`            | `ollama-ai-provider`          | llama3.1 / qwen2.5 / ...                                   | 本地，无需 Key                                                |
| `openrouter`        | `@openrouter/ai-sdk-provider` | 聚合 200+ 模型                                             | 代理                                                          |
| `openai-compatible` | `@ai-sdk/openai` 裸用         | 任意兼容 `/v1/chat/completions` 端点                       | 用户自定义 base URL                                           |
| `local-embedder`    | core + desktop NodeEngine     | `Xenova/bge-small-zh-v1.5` / `bge-base-zh-v1.5` / `bge-m3` | **embed-only**；离线推理；详见 `docs/p5pro-local-embedder.md` |
| `groq`              | `@ai-sdk/groq`                | 超快                                                       | 推理速度极致                                                  |
| `mistral`           | `@ai-sdk/mistral`             | mistral-large, codestral                                   | 欧洲部署                                                      |
| `xai`               | `@ai-sdk/xai`                 | grok-2 / grok-3                                            | —                                                             |
| `cohere`            | `@ai-sdk/cohere`              | command-r                                                  | 强 RAG                                                        |

## 6. 适配器样例：OpenAI

```ts
// packages/core/src/providers/openai.ts
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import type { Provider, ChatStreamInput } from './types';

export class OpenAIProvider implements Provider {
  readonly id: string;
  readonly kind = 'openai' as const;
  readonly name: string;

  private client;

  constructor(opts: {
    id?: string;
    name?: string;
    apiKey: () => Promise<string>; // 延迟获取（走 SecretPort）
    baseURL?: string;
    http: HttpPort; // 必须注入
    organization?: string;
  }) {
    this.id = opts.id ?? 'openai';
    this.name = opts.name ?? 'OpenAI';

    this.client = createOpenAI({
      baseURL: opts.baseURL ?? 'https://api.openai.com/v1',
      // 适配：Vercel AI SDK 接受 fetch 函数
      fetch: async (url, init) =>
        opts.http.fetch(url, {
          ...init,
          headers: {
            ...init?.headers,
            Authorization: `Bearer ${await opts.apiKey()}`,
            ...(opts.organization ? { 'OpenAI-Organization': opts.organization } : {}),
          },
        }),
    });
  }

  async listModels(): Promise<Model[]> {
    // 1. 硬编码已知模型（含能力）
    // 2. 可选：调用 /v1/models 补全
    return KNOWN_OPENAI_MODELS;
  }

  async test(): Promise<ProviderTestResult> {
    const started = Date.now();
    try {
      const models = await this.listModels();
      return { ok: true, latencyMs: Date.now() - started, modelCount: models.length };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - started, error: String(err) };
    }
  }

  async *stream(input: ChatStreamInput): AsyncIterable<StreamEvent> {
    const { fullStream } = streamText({
      model: this.client(stripProviderPrefix(input.modelId)),
      messages: toVercelMessages(input.messages),
      system: input.system,
      temperature: input.temperature,
      topP: input.topP,
      maxTokens: input.maxOutput,
      tools: toVercelTools(input.tools),
      toolChoice: input.toolChoice,
      abortSignal: input.signal,
    });

    for await (const part of fullStream) {
      yield translatePart(part);
    }
  }

  // embed / image 可选实现...
}
```

其他 Provider 结构类似，差异体现在：

- **Anthropic**：`extended thinking` block → 翻译为 `reasoning-delta` 事件
- **Google Gemini**：`thinkingConfig` → 同上；图片用 `inlineData`
- **Ollama**：`apiKey` 返回空，`baseURL` 默认 `http://127.0.0.1:11434`
- **DeepSeek**：R1 模型把 `reasoning_content` 映射成 `reasoning-delta`

## 7. `ChatService` 核心逻辑

```ts
// packages/core/src/services/chat/index.ts
export class ChatService {
  constructor(
    private readonly repos: Repos,
    private readonly deps: CoreDeps,
  ) {}

  async send(input: {
    convId: string;
    parts: ChatPart[];
    modelId?: string;
    options?: SendOptions;
    signal?: AbortSignal;
    onEvent: (ev: StreamEvent) => void;
  }): Promise<void> {
    const conv = await this.repos.conversations.get(input.convId);
    const modelId = input.modelId ?? conv.modelId ?? (await this.defaultModelId());
    const model = await this.repos.models.get(modelId);
    const provider = await this.getProvider(model.providerId);

    // 1. 写入 user 消息
    const userMsg = await this.repos.messages.insert({
      convId: conv.id,
      role: 'user',
      parts: input.parts,
      status: 'ok',
      modelId,
      providerId: model.providerId,
    });

    // 2. 创建 assistant 占位
    const asstMsg = await this.repos.messages.insert({
      convId: conv.id,
      role: 'assistant',
      parts: [],
      status: 'streaming',
      modelId,
      providerId: model.providerId,
      parentId: userMsg.id,
    });
    input.onEvent({ kind: 'message-created', message: asstMsg });

    // 3. 组装上下文（历史 + 系统提示 + 知识库片段 + @提及 + #上下文）
    const messages = await this.buildContext(conv, input.options, userMsg);
    const tools = await this.buildTools(conv, input.options);

    // 4. 调 Provider.stream
    let textAcc = '';
    let reasoningAcc = '';
    const toolAcc = new Map<string, { name: string; argsPartial: string }>();
    let tokensIn = 0,
      tokensOut = 0;

    try {
      for await (const ev of provider.stream({
        modelId,
        messages,
        system: conv.systemPrompt,
        temperature: conv.temperature ?? undefined,
        topP: conv.topP ?? undefined,
        maxOutput: conv.maxOutputTokens ?? undefined,
        tools,
        signal: input.signal,
      })) {
        // 转发事件 + 累计
        input.onEvent({ ...ev, messageId: asstMsg.id });
        if (ev.kind === 'text-delta') textAcc += ev.delta;
        else if (ev.kind === 'reasoning-delta') reasoningAcc += ev.delta;
        else if (ev.kind === 'tool-call-start')
          toolAcc.set(ev.toolCallId, { name: ev.toolName, argsPartial: '' });
        else if (ev.kind === 'tool-call-delta') {
          const t = toolAcc.get(ev.toolCallId);
          if (t) t.argsPartial += ev.argsDelta;
        } else if (ev.kind === 'usage') {
          tokensIn = ev.tokensIn;
          tokensOut = ev.tokensOut;
        }
      }

      // 5. 写入最终 parts
      const parts = assembleParts(textAcc, reasoningAcc, toolAcc);
      await this.repos.messages.finalize(asstMsg.id, {
        parts,
        status: 'ok',
        tokensIn,
        tokensOut,
        finishReason: 'stop',
      });
      input.onEvent({ kind: 'finish', messageId: asstMsg.id, reason: 'stop' });
    } catch (err) {
      await this.repos.messages.finalize(asstMsg.id, {
        status: err.name === 'AbortError' ? 'aborted' : 'error',
        errorCode: classifyError(err),
        errorMessage: err.message,
      });
      input.onEvent({
        kind: 'error',
        messageId: asstMsg.id,
        code: classifyError(err),
        message: err.message,
      });
      throw err;
    }
  }
  // ...retry / abort / editUserMessage / switchBranch / deleteMessage
}
```

## 8. 多模型并发（`@提及` 场景）

当用户 `@模型A @模型B 一起回答`：

```ts
// ChatService.send 检测到 options.mentions.length > 0 时
const targets = [primaryModelId, ...mentions];
await Promise.all(
  targets.map((mid, idx) =>
    this.sendSingle({
      ...baseInput,
      modelId: mid,
      asSiblingOf: userMsg.id, // 所有回答作为 userMsg 的兄弟，UI 用 variant_index 区分
      variantIndex: idx,
    }),
  ),
);
```

UI 用 `BranchSwitcher` 组件切换查看。

## 9. 上下文组装：`#引用` 与知识库

```ts
private async buildContext(conv, options, userMsg): Promise<ChatMessage[]> {
  const history = await this.repos.messages.listForPrompt(conv.id, { limit: 100 });
  const contextChunks = [];

  for (const ref of options.contextRefs ?? []) {
    match(ref)
      .with({ kind: 'document' }, async (r) => {
        const doc = await this.repos.knowledge.getDoc(r.docId);
        contextChunks.push(renderDocRef(doc, r.selection));
      })
      .with({ kind: 'kb-search' }, async (r) => {
        const hits = await this.services.knowledge.search({ kbId: r.kbId, query: r.query, topK: 5 });
        contextChunks.push(renderKbHits(hits));
      })
      .with({ kind: 'message' }, async (r) => {
        const msg = await this.repos.messages.get(r.messageId);
        contextChunks.push(renderMessageRef(msg));
      })
      .run();
  }

  if (contextChunks.length) {
    // 作为 system 追加或 user 消息前置（按 provider 习惯）
    return [
      { role: 'system', parts: [{ kind: 'text', text: formatContext(contextChunks) }] },
      ...history,
      userMsg,
    ];
  }
  return [...history, userMsg];
}
```

## 10. 工具（Tools / Function Calling）

### 10.1 工具定义统一

```ts
// packages/core/src/providers/tools.ts
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema; // 标准 JSON Schema
  execute?: (args: unknown) => Promise<unknown>; // 可选服务端执行
  source: 'builtin' | 'mcp' | 'agent';
  requiresAuth?: boolean;
}
```

### 10.2 内置工具

- `web_search`（绑定 Tavily / SerpAPI / Bing，或 Provider 原生）
- `fetch_url`（抓网页）
- `run_javascript`（沙箱执行，桌面端）
- `read_file` / `write_file`（仅 Agent 模式下，用户授权）
- `execute_shell`（仅 Agent + 桌面 + 用户授权）

### 10.3 MCP 工具

由 `MCPService` 连接外部 MCP Server（stdio / http / sse），把其 `list_tools` 结果转成 `ToolDefinition[]`。

```ts
async buildTools(conv, options): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [];

  if (options.enableBuiltin !== false) {
    tools.push(...BUILTIN_TOOLS.filter(t => !t.requiresAuth || conv.toolPolicy.allowAll));
  }

  for (const serverId of options.mcpServers ?? []) {
    const serverTools = await this.mcp.listAuthorizedTools(serverId);
    tools.push(...serverTools);
  }

  return tools;
}
```

## 11. Agent 循环

```ts
// packages/core/src/services/agent/index.ts
export class AgentService {
  async run(input: AgentRunInput, onEvent: (e: AgentEvent) => void): Promise<void> {
    const run = await this.repos.agents.create({ goal: input.goal, ... });
    onEvent({ kind: 'run-started', runId: run.id });

    let step = 0;
    while (step < MAX_STEPS) {
      const stepRec = await this.repos.agents.insertStep({ runId: run.id, seq: step, kind: 'think' });
      // 调 provider.stream，允许 tool calls
      // 收到 tool-call → 执行 → 填回 tool-result → 下一轮
      // 收到 finish && 无 tool-call → 结束
      // ...
    }
    onEvent({ kind: 'run-ended', runId: run.id });
  }
}
```

## 12. 成本估算

```ts
// packages/core/src/providers/cost.ts
export function estimateCost(
  model: Model,
  tokensIn: number,
  tokensOut: number,
  extra?: { reasoningTokens?: number },
): number /* cents */ {
  const p = model.pricing;
  if (!p) return 0;
  const cents = Math.ceil(
    (tokensIn / 1_000_000) * (p.inputPer1M ?? 0) * 100 +
      (tokensOut / 1_000_000) * (p.outputPer1M ?? 0) * 100 +
      ((extra?.reasoningTokens ?? 0) / 1_000_000) * (p.reasoningPer1M ?? 0) * 100,
  );
  return cents;
}
```

每条消息完成时写回 `messages.cost_usd_cents`，UI 在会话详情和总览页聚合展示。

## 13. Provider 注册与发现

Provider 注册表在启动时构建：

```ts
// packages/core/src/providers/registry.ts
export class ProviderRegistry {
  private providers = new Map<string, Provider>();

  constructor(private deps: CoreDeps) {}

  async initFromDb() {
    const rows = await this.deps.storage.all({ sql: 'SELECT * FROM providers WHERE enabled=1', params: [] });
    for (const row of rows) this.providers.set(row.id, this.instantiate(row));
  }

  get(id: string): Provider | undefined { return this.providers.get(id); }

  private instantiate(row: ProviderRow): Provider {
    const apiKey = () => this.deps.secret.get(row.api_key_ref!).then(v => v ?? '');
    switch (row.kind) {
      case 'openai':            return new OpenAIProvider({ id: row.id, apiKey, baseURL: row.base_url, http: this.deps.http });
      case 'anthropic':         return new AnthropicProvider({ ... });
      case 'google':            return new GoogleProvider({ ... });
      case 'deepseek':          return new DeepseekProvider({ ... });
      case 'ollama':            return new OllamaProvider({ ... });
      case 'openai-compatible': return new OpenAICompatibleProvider({ ... });
      // ...
    }
  }

  async refresh(id: string) {
    const row = await this.loadRow(id);
    this.providers.set(id, this.instantiate(row));
  }
}
```

## 14. 自定义 Provider（"OpenAI 兼容"）

用户可在"设置 → 模型"里添加：

```
+ 添加 Provider
  Kind: OpenAI 兼容
  Name: 通义千问
  Base URL: https://dashscope.aliyuncs.com/compatible-mode/v1
  API Key: sk-xxx
  模型清单: [qwen-max, qwen-plus, qwen-turbo]
```

保存后立即生效；`Base URL` 会经 SSRF 校验（仅 https，禁止 private IP）。

## 15. Provider 错误分类

```ts
export function classifyProviderError(err: unknown): AppErrorCode {
  if (err instanceof AbortError) return 'ABORTED';
  if (err.status === 401 || err.status === 403) return 'UNAUTHORIZED';
  if (err.status === 429) return 'RATE_LIMIT';
  if (err.status === 402) return 'INSUFFICIENT_QUOTA';
  if (err.status >= 500) return 'PROVIDER_ERROR';
  if (err instanceof NetworkError) return 'NETWORK';
  return 'UNKNOWN';
}
```

UI 展示：

- `RATE_LIMIT` → Toast 带"自动重试 2s / 稍后重试"按钮
- `INSUFFICIENT_QUOTA` → 指向"设置 → 账单"（仅显示提示）
- `UNAUTHORIZED` → 红色提示 + 跳到 Provider 设置
- `NETWORK` → 浮条"离线中" + 自动重连

## 16. 开放问题

| 问题                                                    | 状态                               |
| ------------------------------------------------------- | ---------------------------------- |
| 是否支持 Provider 的"**计费聚合**"（Stripe / 企业发票） | 放 Pro 版考虑                      |
| Ollama 的模型下载 UI 是否内置？                         | M5 加，调用 Ollama API             |
| DeepSeek R1 的 `reasoning_content` 是否默认展示？       | 默认折叠，用户可开                 |
| 上下文超长时的**自动总结压缩**                          | M3 引入 "summary compression" 策略 |
