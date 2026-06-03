/**
 * EmptyState · 首页空状态
 *
 * 见 docs/12-ui-design.md §6.2。
 *
 * - 大字标语
 * - 推荐 prompts 卡片网格
 * - 最近会话列表
 */
import { Code2, Languages, MessageSquare, PenLine, Sparkles } from 'lucide-react';

import { Card, cn } from '@xiabao/ui';

import { useTranslation } from '../lib/useTranslation';

import type { ReactNode } from 'react';

export interface RecommendedPrompt {
  id: string;
  title?: string;
  titleKey?: string;
  description?: string;
  descriptionKey?: string;
  icon?: ReactNode;
  prompt: string;
}

export interface RecentConversation {
  id: string;
  title: string;
  updatedAt: number;
}

interface Props {
  prompts?: RecommendedPrompt[];
  recents?: RecentConversation[];
  onSelectPrompt?: (p: RecommendedPrompt) => void;
  onSelectRecent?: (c: RecentConversation) => void;
}

const DEFAULT_PROMPTS: RecommendedPrompt[] = [
  {
    id: 'write',
    titleKey: 'emptyState.promptWrite',
    descriptionKey: 'emptyState.promptWriteDesc',
    icon: <PenLine className="h-4 w-4" />,
    prompt: '请帮我写一封正式的邮件给同事，主题是关于下周一的产品评审会议。',
  },
  {
    id: 'code',
    titleKey: 'emptyState.promptExplain',
    descriptionKey: 'emptyState.promptExplainDesc',
    icon: <Code2 className="h-4 w-4" />,
    prompt: '请逐行解释下面这段代码，并指出它的潜在问题：\n\n```\n\n```',
  },
  {
    id: 'translate',
    titleKey: 'emptyState.promptTranslate',
    descriptionKey: 'emptyState.promptTranslateDesc',
    icon: <Languages className="h-4 w-4" />,
    prompt: '请把下面这段中文翻译成自然、地道的英文：\n\n',
  },
  {
    id: 'brainstorm',
    titleKey: 'emptyState.promptBrainstorm',
    descriptionKey: 'emptyState.promptBrainstormDesc',
    icon: <Sparkles className="h-4 w-4" />,
    prompt: '我想做一个本地优先的 AI 工作台，帮我列出 10 个差异化卖点。',
  },
];

export function EmptyState({
  prompts = DEFAULT_PROMPTS,
  recents = [],
  onSelectPrompt,
  onSelectRecent,
}: Props) {
  const { t } = useTranslation();

  const resolvedPrompts = prompts.map((p) => ({
    ...p,
    title: p.titleKey ? t(p.titleKey, { defaultValue: p.title }) : (p.title ?? ''),
    description: p.descriptionKey
      ? t(p.descriptionKey, { defaultValue: p.description })
      : (p.description ?? ''),
  }));

  return (
    <div className="scroll-thin flex h-full w-full flex-col overflow-auto px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="text-center">
          <div className="bg-primary/10 text-primary mx-auto flex h-12 w-12 items-center justify-center rounded-2xl">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-foreground mt-4 text-2xl font-semibold tracking-tight">
            {t('emptyState.startHint', { defaultValue: '开始一段对话' })}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t('emptyState.orSelect', { defaultValue: '选择一个示例或直接在下方输入框开始' })}
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {resolvedPrompts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectPrompt?.(p)}
              className={cn(
                'group text-left transition-all',
                'border-border/60 hover:border-primary/60 hover:shadow-glass rounded-xl border p-3',
                'bg-card/40 hover:bg-card/70',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-primary bg-primary/10 inline-flex h-7 w-7 items-center justify-center rounded-lg">
                  {p.icon ?? <Sparkles className="h-4 w-4" />}
                </span>
                <span className="text-sm font-medium">{p.title}</span>
              </div>
              <p className="text-muted-foreground mt-2 text-xs">{p.description}</p>
            </button>
          ))}
        </div>

        {recents.length > 0 && (
          <div className="mt-10">
            <h2 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
              {t('emptyState.recentTitle', { defaultValue: '最近会话' })}
            </h2>
            <Card className="overflow-hidden">
              <ul className="divide-border/40 divide-y">
                {recents.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onSelectRecent?.(c)}
                      className="hover:bg-secondary/40 flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
                    >
                      <MessageSquare className="text-muted-foreground h-3 w-3" />
                      <span className="truncate">{c.title}</span>
                      <span className="text-muted-foreground ml-auto text-[10px]">
                        {formatRelative(c.updatedAt, t)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function formatRelative(
  ts: number,
  t: (key: string, options?: { defaultValue?: string; count?: number }) => string,
): string {
  const diff = Date.now() - ts;
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < hour)
    return `${Math.max(1, Math.floor(diff / min))} ${t('common.minute', { defaultValue: '分钟' })}`;
  if (diff < day) return `${Math.floor(diff / hour)} ${t('common.hour', { defaultValue: '小时' })}`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} ${t('common.day', { defaultValue: '天' })}`;
  return new Date(ts).toLocaleDateString();
}
