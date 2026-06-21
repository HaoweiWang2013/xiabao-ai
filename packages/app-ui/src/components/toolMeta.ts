/**
 * 工具元信息映射：工具名 → 图标 / 标签色
 *
 * 让 tool-call 和 tool-result 在 UI 上呈现可辨识的视觉标识。
 */
import {
  Braces,
  FileText,
  Globe,
  MessageSquare,
  Search,
  Terminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export interface ToolMeta {
  icon: LucideIcon;
  /** Tailwind 文本色 class */
  color: string;
  /** Tailwind 背景色 class（用于圆形徽标底） */
  bg: string;
  /** 人类可读的短标签 */
  label: string;
}

const META_MAP: Record<string, ToolMeta> = {
  web_search: {
    icon: Search,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    label: 'Web Search',
  },
  fetch_page_with_content: {
    icon: Globe,
    color: 'text-cyan-500',
    bg: 'bg-cyan-500/10',
    label: 'Fetch Page',
  },
  fetch_pages_batch: {
    icon: Globe,
    color: 'text-cyan-500',
    bg: 'bg-cyan-500/10',
    label: 'Batch Fetch',
  },
  file_read: {
    icon: FileText,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    label: 'Read File',
  },
  file_write: {
    icon: FileText,
    color: 'text-amber-600',
    bg: 'bg-amber-600/10',
    label: 'Write File',
  },
  run_shell: {
    icon: Terminal,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    label: 'Shell',
  },
  run_javascript: {
    icon: Braces,
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
    label: 'JavaScript',
  },
  echo: {
    icon: MessageSquare,
    color: 'text-muted-foreground',
    bg: 'bg-muted',
    label: 'Echo',
  },
};

const DEFAULT_META: ToolMeta = {
  icon: Wrench,
  color: 'text-muted-foreground',
  bg: 'bg-muted',
  label: 'Tool',
};

/** 根据工具名获取元信息 */
export function getToolMeta(toolName: string): ToolMeta {
  return META_MAP[toolName] ?? DEFAULT_META;
}

/**
 * 从 argsJson 中提取可读的摘要字符串
 *
 * 将 JSON 参数格式化为 `key: value` 形式，过长值截断。
 */
export function formatArgsSummary(argsJson: string, maxLen = 60): string {
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>;
    const entries = Object.entries(args);
    if (entries.length === 0) return '';

    const parts = entries.map(([k, v]) => {
      const val =
        typeof v === 'string'
          ? v.length > maxLen
            ? v.slice(0, maxLen) + '…'
            : v
          : JSON.stringify(v);
      return `${k}: ${val}`;
    });

    return parts.join(' · ');
  } catch {
    return argsJson.length > maxLen ? argsJson.slice(0, maxLen) + '…' : argsJson;
  }
}

/**
 * 从 tool result JSON 中提取摘要信息（首行预览）
 *
 * 策略：优先取 `error`、`title`、`query`、`url`、`path` 等语义字段。
 */
export function extractResultSummary(resultJson: string): {
  isError: boolean;
  summary: string;
} {
  try {
    const data = JSON.parse(resultJson) as Record<string, unknown>;

    if (typeof data.error === 'string') {
      return { isError: true, summary: data.error };
    }

    const semanticKeys = ['title', 'query', 'url', 'path', 'command', 'status'];
    const parts: string[] = [];
    for (const key of semanticKeys) {
      const val = data[key];
      if (val != null) {
        const str = typeof val === 'string' ? val : JSON.stringify(val);
        parts.push(`${key}: ${str.length > 50 ? str.slice(0, 50) + '…' : str}`);
      }
    }

    // 搜索结果数量
    if (Array.isArray(data.results)) {
      parts.push(`results: ${data.results.length}`);
    }

    if (parts.length > 0) {
      return { isError: false, summary: parts.join(' · ') };
    }

    // 降级：取 JSON 前 100 字符
    const raw = JSON.stringify(data);
    return { isError: false, summary: raw.length > 100 ? raw.slice(0, 100) + '…' : raw };
  } catch {
    const raw = resultJson.trim();
    return { isError: false, summary: raw.length > 100 ? raw.slice(0, 100) + '…' : raw };
  }
}
