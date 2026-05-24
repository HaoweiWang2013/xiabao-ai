/**
 * `@xiabao/core/chat` · 平台无关的聊天交互纯函数
 *
 * 当前只放：
 * - `mention.ts` 内联 `#xxx` mention 探测（M4 长尾 Phase 7 文档级 inline 引用）
 *
 * 未来可放：命令面板（`/cmd`）解析、@提及历史消息等同样需要在 textarea 上交互的字符串逻辑。
 */
export * from './mention';
