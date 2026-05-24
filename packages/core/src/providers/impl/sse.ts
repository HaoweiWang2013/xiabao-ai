/**
 * 极简 SSE 解析器
 *
 * 输入：字节流（AsyncIterable<Uint8Array>）
 * 输出：解析后的消息事件 { data, event?, id? }
 *
 * 仅实现 OpenAI / Anthropic 规模的子集：按 `\n\n` 切包，`data:` 前缀。
 */

export interface SseEvent {
  event?: string;
  id?: string;
  data: string;
}

const LF = 0x0a; // '\n'

export async function* parseSse(stream: AsyncIterable<Uint8Array>): AsyncIterable<SseEvent> {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });

    // 按事件边界 \n\n 切分（兼容 \r\n\r\n）
    let sepIdx: number;
    while ((sepIdx = findEventBoundary(buffer)) !== -1) {
      const raw = buffer.slice(0, sepIdx);
      // 跳过分隔符（\n\n 或 \r\n\r\n）
      buffer = buffer[sepIdx] === '\r' ? buffer.slice(sepIdx + 4) : buffer.slice(sepIdx + 2);

      const evt = parseEventBlock(raw);
      if (evt) yield evt;
    }
  }

  // flush 尾部
  const tail = buffer + decoder.decode();
  if (tail.trim().length > 0) {
    const evt = parseEventBlock(tail);
    if (evt) yield evt;
  }
}

function findEventBoundary(s: string): number {
  // 返回第一个 \n\n 或 \r\n\r\n 的起始位置
  let i = 0;
  while (i < s.length) {
    const code = s.charCodeAt(i);
    if (code === LF) {
      // 当前是 \n，检查下一个
      if (s.charCodeAt(i + 1) === LF) return i;
    } else if (code === 0x0d /* \r */) {
      if (
        s.charCodeAt(i + 1) === LF &&
        s.charCodeAt(i + 2) === 0x0d &&
        s.charCodeAt(i + 3) === LF
      ) {
        return i;
      }
    }
    i++;
  }
  return -1;
}

function parseEventBlock(raw: string): SseEvent | null {
  const lines = raw.split(/\r?\n/);
  const dataLines: string[] = [];
  let event: string | undefined;
  let id: string | undefined;

  for (const line of lines) {
    if (line.length === 0 || line.startsWith(':')) continue; // 空行或注释
    const colonIdx = line.indexOf(':');
    let field: string;
    let value: string;
    if (colonIdx === -1) {
      field = line;
      value = '';
    } else {
      field = line.slice(0, colonIdx);
      value = line.slice(colonIdx + 1);
      if (value.startsWith(' ')) value = value.slice(1);
    }
    switch (field) {
      case 'data':
        dataLines.push(value);
        break;
      case 'event':
        event = value;
        break;
      case 'id':
        id = value;
        break;
      // retry/其他 字段暂不处理
    }
  }

  if (dataLines.length === 0) return null;
  return { event, id, data: dataLines.join('\n') };
}
