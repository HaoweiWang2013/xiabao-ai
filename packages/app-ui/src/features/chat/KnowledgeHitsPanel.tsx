/**
 * KnowledgeHitsPanel · assistant 消息下方渲染 RAG 命中源块（M4-E）
 *
 * 数据来源：message.extra.knowledgeHits（由 ChatService.buildKnowledgeContext 写入）。
 *
 * - 折叠条：`📚 引用来源 (N)` / 展开后列出每一条 hit
 * - 每条 hit：`docName #seq · score 0.876` + 首 120 字预览（不做 markdown 渲染，避免嵌套）
 * - hits 为空时不渲染（不占位）
 */
import { Quote } from 'lucide-react';
import { useState } from 'react';

import type { SearchHit } from '@xiabao/server';
import { cn } from '@xiabao/ui';

import { useTranslation } from '../../lib/useTranslation';

interface Props {
  hits: SearchHit[];
}

const PREVIEW_LIMIT = 180;

export function KnowledgeHitsPanel({ hits }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (hits.length === 0) return null;

  return (
    <div className="border-border/40 bg-secondary/30 mt-3 rounded-md border text-xs">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="hover:bg-accent/40 flex w-full items-center gap-2 rounded-t-md px-2.5 py-1.5 text-left"
        aria-expanded={expanded}
      >
        <Quote className="text-muted-foreground h-3 w-3" />
        <span className="text-foreground font-medium">{t('chat.hitsTitle')}</span>
        <span className="text-muted-foreground">({hits.length})</span>
        <span className="flex-1" />
        <span
          className={cn(
            'text-muted-foreground text-[10px] transition-transform',
            expanded && 'rotate-180',
          )}
        >
          ▾
        </span>
      </button>
      {expanded ? (
        <ul className="divide-border/40 border-border/40 divide-y border-t">
          {hits.map((h) => (
            <li key={h.chunkId} className="px-2.5 py-2">
              <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
                <span className="text-foreground truncate font-medium">{h.docName}</span>
                <span>#{h.seq}</span>
                <span>·</span>
                <span>
                  {t('chat.hitsScore', {
                    score: Number.isFinite(h.score) ? h.score.toFixed(3) : String(h.score),
                  })}
                </span>
              </div>
              <p className="text-foreground/80 mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                {truncate(h.text, PREVIEW_LIMIT)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit).trimEnd() + '…';
}
