/**
 * 内联 mention 探测 · 用于聊天输入框 `#xxx` 触发文档候选浮层（M4 长尾 Phase 7）
 *
 * 平台无关：只接 (text, caret) 两个原始输入，返回光标前是否处于一个未闭合的 mention
 * 状态。具体的浮层渲染 / textarea 监听由 UI 层（如 @xiabao/app-ui 的
 * useMentionAutocomplete hook）实现。
 *
 * 设计目标：
 * - **# 必须紧跟边界**：开头、空格、换行或制表符。避免误触 URL fragment 之类的 `#`（`https://x.com/p#a`）。
 * - **query 不能含空白**：用户敲一个空格就视为放弃 mention，浮层关闭。
 * - **query 长度上限**：30 字符（防止历史超长串拖慢匹配）。
 * - **多 # 不嵌套**：query 内不能再出现 `#`，第二个 `#` 视为新 mention。
 * - **纯函数 + 零依赖**：仅做字符串切片与正则，不持有任何状态。
 */

/** 单次 mention 探测结果 */
export interface MentionMatch {
  /** `#` 字符在 text 中的索引（包含）；replaceMentionRange 用它做替换起点 */
  startIndex: number;
  /** 光标位置（exclusive end）；与传入 caret 相同，便于上层一次性透传 */
  endIndex: number;
  /** `#` 之后到光标之间的文本（不含 `#` 本身），用作浮层过滤 query */
  query: string;
}

/** 限制：query 最长 30 字符；超出视为非 mention，避免在长串内部误判 */
export const MAX_MENTION_QUERY_LENGTH = 30;

/**
 * 在 `text` 的 `caret` 位置探测是否处于一个未闭合的 `#token` 输入中。
 *
 * - 返回非空 → UI 应弹候选浮层，按 `query` 做过滤
 * - 返回 `null` → UI 应关闭浮层
 *
 * 边界规则：
 * - `#` 前必须是字符串开头或空白字符（` `、`\t`、`\n`、`\r`），否则不算 mention
 * - `#` 与光标之间不能含空白、不能再次出现 `#`
 * - `#` 与光标之间长度（不含 `#`）必须 ≤ MAX_MENTION_QUERY_LENGTH
 *
 * @param text 当前 textarea 完整内容
 * @param caret 光标位置（0..text.length）；通常取自 selectionStart
 */
export function detectMentionAtCursor(text: string, caret: number): MentionMatch | null {
  if (caret < 0 || caret > text.length) return null;
  // 从光标向前回扫，最多 MAX_MENTION_QUERY_LENGTH + 1（含 `#` 自身）
  const scanFrom = Math.max(0, caret - (MAX_MENTION_QUERY_LENGTH + 1));
  for (let i = caret - 1; i >= scanFrom; i--) {
    const ch = text[i];
    if (ch === undefined) return null;
    if (ch === '#') {
      // `#` 前必须是边界
      const prev = i > 0 ? text[i - 1] : undefined;
      const atBoundary = prev === undefined || /\s/.test(prev);
      if (!atBoundary) return null;
      const query = text.slice(i + 1, caret);
      // query 不能含空白或 `#`（前面回扫时已经保证，但显式校验一遍更安全）
      if (/[\s#]/.test(query)) return null;
      return { startIndex: i, endIndex: caret, query };
    }
    // 在 `#` 之前若遇到空白或新的 `#`（已经处理），则不可能再有合法的 mention 起点
    if (/\s/.test(ch)) return null;
  }
  return null;
}

/**
 * 用 `replacement` 替换 text 中 `[startIndex, endIndex)` 区间，返回新文本与新的光标位置。
 *
 * 典型用法：
 * - 用户选中候选 → 调 `replaceMentionRange(text, match, '')`：把 `#token` 整段从输入框删除，
 *   同时上层把 docId 加到 `selectedDocIds`（视觉痕迹由 toolbar badge 体现）。
 * - 或传 `replaceMentionRange(text, match, '#docName ')`：把 `#token` 替换成 `#docName ` 嵌入文本
 *   （需要服务端能解析 `#docName` 这种语法；MVP 不走这条路径）。
 *
 * @returns `nextValue` 替换后完整文本；`nextCaret` 替换后光标位置（紧接 replacement 之后）
 */
export function replaceMentionRange(
  text: string,
  range: { startIndex: number; endIndex: number },
  replacement: string,
): { nextValue: string; nextCaret: number } {
  const { startIndex, endIndex } = range;
  if (startIndex < 0 || endIndex < startIndex || endIndex > text.length) {
    return { nextValue: text, nextCaret: endIndex };
  }
  const before = text.slice(0, startIndex);
  const after = text.slice(endIndex);
  const nextValue = before + replacement + after;
  const nextCaret = startIndex + replacement.length;
  return { nextValue, nextCaret };
}

/**
 * fuzzy 子序列匹配：query 的字符按顺序在 candidate 中出现即视为命中。
 *
 * - 大小写不敏感
 * - 空 query → 全部命中（返回 true）
 * - 单字符匹配走 String#indexOf O(n)，整体 O(query.length * candidate.length)
 *   对文档名级别（< 200 字符）足够快
 *
 * 注意：这里只判断「是否命中」，不返回 score；上层若要排序可在子序列长度 + 命中位置上做加权。
 * MVP 不做 score，按 listDocsForKbs 原顺序展示，再用此函数做存活过滤。
 */
export function fuzzyMatch(query: string, candidate: string): boolean {
  if (query === '') return true;
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  let qi = 0;
  for (let ci = 0; ci < c.length && qi < q.length; ci++) {
    if (c[ci] === q[qi]) qi++;
  }
  return qi === q.length;
}
