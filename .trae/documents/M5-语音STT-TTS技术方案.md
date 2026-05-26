# M5 语音（STT/TTS）技术方案

## 概述

基于现有 Image 模块的完整实现模式，实现 M5 语音子系统：STT（语音转文本）+ TTS（文本转语音）。

---

## 决策记录

| 决策点   | 方案                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| 模型发现 | **两者结合**：硬编码默认（whisper-1/tts-1/tts-1-hd）+ ModelCapability 扩展 stt/tts 字段 + capabilities.ts 推断规则 |
| DB 设计  | **完整独立表**：voice_transcriptions + voice_syntheses，含 status/audioPath/duration/format/modelId 状态机         |
| 录音交互 | **按住说话 + 单击切换**：mousedown/touchstart 开始录音 → mouseup/touchend 停止并发送；点击切换持续录音模式         |
| 图标     | **lucide-react**：Mic/MicOff/AudioLines 等，不用 Emoji                                                             |

---

## 实现步骤（共 11 步）

### 步骤 1：扩展 ModelCapability — 添加 stt/tts 标志

**文件**：`packages/core/src/models/provider.ts`

```ts
export const ModelCapabilitySchema = z
  .object({
    streaming: z.boolean().default(true),
    tools: z.boolean().default(false),
    vision: z.boolean().default(false),
    audio: z.boolean().default(false),
    pdfInput: z.boolean().default(false),
    jsonMode: z.boolean().default(false),
    reasoning: z.boolean().default(false),
    stt: z.boolean().default(false), // 新增：语音转文本
    tts: z.boolean().default(false), // 新增：文本转语音
  })
  .partial();
```

### 步骤 2：扩展 capabilities.ts — 添加 STT/TTS 推断规则

**文件**：`packages/core/src/providers/capabilities.ts`

- 添加 `CapabilityRule` 的 `stt`/`tts` 到 `capability` 类型
- 新增规则：`whisper-1` → `{ stt: true }`，`tts-1` / `tts-1-hd` → `{ tts: true }`
- 同步更新 `ModelCapability` 的 `Partial<Pick<...>>` 泛型

### 步骤 3：定义 ChatProvider 语音接口

**文件**：`packages/core/src/providers/types.ts`

```ts
export interface SttOptions {
  model: string;
  language?: string; // ISO-639-1，默认自动检测
  signal?: AbortSignal;
}

export interface SttResult {
  text: string;
  language?: string;
  durationMs?: number;
}

export interface TtsOptions {
  model: string;
  text: string;
  voice?: string; // alloy / echo / fable / onyx / nova / shimmer
  speed?: number; // 0.25 ~ 4.0
  format?: string; // mp3 / opus / aac / flac
  signal?: AbortSignal;
}

export interface TtsResult {
  audioBytes: Uint8Array;
  format: string;
  durationMs?: number;
}
```

在 `ChatProvider` 接口添加：

```ts
stt?(audioBytes: Uint8Array, options: SttOptions): Promise<SttResult>;
tts?(options: TtsOptions): Promise<TtsResult>;
```

**注意**：先做 `Promise` 返回值（非 AsyncIterable），与 OpenAI API 的实际行为一致（REST 非流式）。后续版本可升级为流式。

### 步骤 4：实现 OpenAI Provider stt() / tts()

**文件**：`packages/core/src/providers/impl/openai.ts`

```ts
// STT: POST /v1/audio/transcriptions (multipart/form-data)
async stt(audioBytes: Uint8Array, options: SttOptions): Promise<SttResult> {
  const formData = new FormData();
  formData.append('file', new Blob([audioBytes], { type: 'audio/webm' }), 'audio.webm');
  formData.append('model', options.model);
  if (options.language) formData.append('language', options.language);

  const res = await this.http.fetch(`${this.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { ...this.authHeaders() },
    body: formData,
    signal: options.signal,
  });
  // ... 解析 { text, language, duration }
}

// TTS: POST /v1/audio/speech (返回 audio bytes)
async tts(options: TtsOptions): Promise<TtsResult> {
  const res = await this.http.fetch(`${this.baseUrl}/audio/speech`, {
    method: 'POST',
    headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model,
      input: options.text,
      voice: options.voice ?? 'alloy',
      speed: options.speed ?? 1,
      response_format: options.format ?? 'mp3',
    }),
    signal: options.signal,
  });
  const audioBytes = await res.bytes();
  return { audioBytes, format: options.format ?? 'mp3' };
}
```

### 步骤 5：创建 voice_transcriptions + voice_syntheses 表

**文件**：`packages/server/src/db/migrations/0008_add_voice.sql`

```sql
CREATE TABLE `voice_transcriptions` (
  `id` text PRIMARY KEY NOT NULL,
  `conv_id` text,
  `model_id` text NOT NULL,
  `status` text NOT NULL,       -- queued / running / done / error
  `language` text,
  `text` text,
  `audio_path` text,
  `audio_format` text,
  `audio_duration_ms` integer,
  `duration_ms` integer,
  `error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer
);

CREATE TABLE `voice_syntheses` (
  `id` text PRIMARY KEY NOT NULL,
  `conv_id` text,
  `model_id` text NOT NULL,
  `status` text NOT NULL,
  `input_text` text NOT NULL,
  `voice` text,
  `speed` real,
  `audio_path` text,
  `audio_format` text,
  `audio_duration_ms` integer,
  `duration_ms` integer,
  `error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer
);
```

**Drizzle Schema**：`packages/server/src/db/schema/voiceTranscriptions.ts` + `voiceSyntheses.ts`

### 步骤 6：创建 VoiceRepo

**文件**：`packages/server/src/repos/voice.ts`

```ts
- voiceTranscriptions: create / getById / list / updateStatus
- voiceSyntheses: create / getById / list / updateStatus
```

模式完全参照 `images.ts`。

### 步骤 7：创建 VoiceService

**文件**：`packages/server/src/services/voice.service.ts`

```ts
// STT 流：
//   1. 接收 audioBytes（前端录制后通过 tRPC 上传）
//   2. 保存到 userData/audio/{id}.webm
//   3. 根据 modelId 获取 provider 实例
//   4. 调用 provider.stt(audioBytes, options)
//   5. 返回文本结果

// TTS 流：
//   1. 接收 text + modelId + voice/speed 参数
//   2. 根据 modelId 获取 provider 实例
//   3. 调用 provider.tts(options)
//   4. 保存 audio bytes 到 userData/audio/{id}.mp3
//   5. 返回 audioPath + audioUrl
```

参照 `image.service.ts` 的 generate / runBackgroundTask / streamStatus 模式。

### 步骤 8：创建 voice tRPC 路由

**文件**：`packages/server/src/trpc/routers/voice.ts`

```ts
- stt: procedure (mutation) — 接收 Base64 音频 + modelId → 返回 { id, text, language }
- tts: procedure (subscription) — 接收 text + modelId → 流式返回 { id, status, audioPath }
- listTranscriptions: query
- listSyntheses: query
```

### 步骤 9：录制 Hook — useAudioRecorder

**文件**：`packages/app-ui/src/hooks/useAudioRecorder.ts`

```ts
- MediaRecorder API：mimeType 'audio/webm;codecs=opus'
- getDisplayMedia 申请麦克风权限
- 状态机：idle → recording → stopped
- 返回：{ state, audioBlob, peakLevel, startRecording, stopRecording, error }
```

交互逻辑：

1. **按住说话**：onPointerDown → startRecording，onPointerUp → stop + send
2. **单击切换**：onClick → 如果 idle 则 startRecording，如果 recording 则 stopAndSend
3. 峰值电平：`AnalyserNode.getByteFrequencyData()` 用于波形显示
4. 最长录音：60 秒自动停止

### 步骤 10：启用 Composer 麦克风按钮

**文件**：`packages/app-ui/src/components/Composer.tsx`

- 移除 `disabled` 属性
- 绑定 useAudioRecorder hook
- 录音中：替换 Mic 为 `AudioLines` 动画图标 + 红色脉冲动画
- 按住说话模式：onPointerDown / onPointerUp
- 单击切换模式：onClick toggle
- 录音后自动调用 `trpc.voice.stt.useMutation()` 获取文本
- 获取文本后：直接 send（若 Composer 为空则填入文本，若有内容则追加）

**文件**：`packages/app-ui/src/features/settings/model-display.tsx`（可选）

- CAPABILITY_META 添加 `stt`（Mic 图标）和 `tts`（Volume2 图标）

### 步骤 11：Jotai Atoms

**文件**：`packages/state/src/index.ts`

```ts
export const sttModelIdAtom = createPersistedAtom<string>('voice.sttModelId', 'whisper-1');
export const ttsModelIdAtom = createPersistedAtom<string>('voice.ttsModelId', 'tts-1');
export const ttsVoiceAtom = createPersistedAtom<string>('voice.ttsVoice', 'alloy');
export const ttsSpeedAtom = createPersistedAtom<number>('voice.ttsSpeed', 1);
export const voiceAutoSendAtom = createPersistedAtom<boolean>('voice.autoSend', true);
```

---

## 文件清单

| #   | 文件                                                   | 操作 | 包             |
| --- | ------------------------------------------------------ | ---- | -------------- |
| 1   | `packages/core/src/models/provider.ts`                 | 修改 | @xiabao/core   |
| 2   | `packages/core/src/providers/capabilities.ts`          | 修改 | @xiabao/core   |
| 3   | `packages/core/src/providers/types.ts`                 | 修改 | @xiabao/core   |
| 4   | `packages/core/src/providers/impl/openai.ts`           | 修改 | @xiabao/core   |
| 5   | `packages/server/src/db/migrations/0008_add_voice.sql` | 新建 | @xiabao/server |
| 6   | `packages/server/src/db/schema/voiceTranscriptions.ts` | 新建 | @xiabao/server |
| 7   | `packages/server/src/db/schema/voiceSyntheses.ts`      | 新建 | @xiabao/server |
| 8   | `packages/server/src/db/schema/index.ts`               | 修改 | @xiabao/server |
| 9   | `packages/server/src/repos/voice.ts`                   | 新建 | @xiabao/server |
| 10  | `packages/server/src/repos/index.ts`                   | 修改 | @xiabao/server |
| 11  | `packages/server/src/services/voice.service.ts`        | 新建 | @xiabao/server |
| 12  | `packages/server/src/services/index.ts`                | 修改 | @xiabao/server |
| 13  | `packages/server/src/trpc/routers/voice.ts`            | 新建 | @xiabao/server |
| 14  | `packages/server/src/trpc/routers/index.ts`            | 修改 | @xiabao/server |
| 15  | `packages/app-ui/src/hooks/useAudioRecorder.ts`        | 新建 | @xiabao/app-ui |
| 16  | `packages/app-ui/src/components/Composer.tsx`          | 修改 | @xiabao/app-ui |
| 17  | `packages/state/src/index.ts`                          | 修改 | @xiabao/state  |

共 **17 文件**（6 新建 + 11 修改）

---

## 依赖关系

```
ModelCapability.stt/tts (core)
    ↓
capabilities.ts 推断规则 (core)
    ↓
types.ts SttOptions/TtsOptions (core)
    ↓
openai.ts stt()/tts() 实现 (core)
    ↓
DB migration + schema (server)
    ↓
VoiceRepo (server)
    ↓
VoiceService (server)
    ↓
voice tRPC router (server)
    ↓
Jotai atoms (state)
    ↓
useAudioRecorder hook (app-ui)
    ↓
Composer Mic 按钮 (app-ui)
```

---

## 端口/能力矩阵

| 端点                       | 方法                | 用途                                |
| -------------------------- | ------------------- | ----------------------------------- |
| `/v1/audio/transcriptions` | POST (multipart)    | OpenAI Whisper STT                  |
| `/v1/audio/speech`         | POST (JSON → bytes) | OpenAI TTS                          |
| `trpc.voice.stt`           | mutation            | 上传 Base64 音频 → 转录文本         |
| `trpc.voice.tts`           | subscription        | 文本 → 流式合成 → 音频文件          |
| `useAudioRecorder`         | hook                | 浏览器 MediaRecorder + AnalyserNode |
