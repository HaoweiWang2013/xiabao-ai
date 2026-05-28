/**
 * MarkdownRenderer · 受控的 Markdown 渲染
 *
 * - GFM 表格、任务列表、删除线
 * - 代码块用 rehype-highlight（轻量），并暴露 CodeBlock 用于带行号 / 复制的版本
 * - 安全：禁止原生 HTML（react-markdown 默认）
 */
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

import { cn } from '@xiabao/ui';

import { useTranslation } from '../lib/useTranslation';

import type { Components } from 'react-markdown';

interface Props {
  text: string;
  /** 紧凑模式：缩小字号 */
  compact?: boolean;
  className?: string;
}

export function MarkdownRenderer({ text, compact, className }: Props) {
  return (
    <div
      className={cn(
        'prose-doc max-w-none break-words leading-relaxed',
        compact ? 'text-xs' : 'text-sm',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={MD_COMPONENTS}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

const MD_COMPONENTS: Components = {
  p: ({ node: _node, ...props }) => <p className="my-2 leading-relaxed" {...props} />,
  h1: ({ node: _node, ...props }) => <h1 className="mb-2 mt-4 text-xl font-semibold" {...props} />,
  h2: ({ node: _node, ...props }) => <h2 className="mb-2 mt-4 text-lg font-semibold" {...props} />,
  h3: ({ node: _node, ...props }) => (
    <h3 className="mb-1.5 mt-3 text-base font-semibold" {...props} />
  ),
  ul: ({ node: _node, ...props }) => <ul className="my-2 list-disc pl-5" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="my-2 list-decimal pl-5" {...props} />,
  li: ({ node: _node, ...props }) => <li className="my-0.5" {...props} />,
  a: ({ node: _node, ...props }) => (
    <a
      className="text-primary underline-offset-2 hover:underline"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote
      className="border-primary/40 text-muted-foreground my-2 border-l-2 pl-3"
      {...props}
    />
  ),
  hr: () => <hr className="border-border/40 my-4" />,
  table: ({ node: _node, ...props }) => (
    <div className="border-border/40 my-3 overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th
      className="border-border/40 bg-secondary/40 border-b px-2 py-1 text-left font-medium"
      {...props}
    />
  ),
  td: ({ node: _node, ...props }) => (
    <td className="border-border/30 border-b px-2 py-1 align-top" {...props} />
  ),
  code: ({ node: _node, className: cls, children, ...rest }) => {
    const isBlock = /\blanguage-/.test(cls ?? '');
    const lang = cls?.match(/language-([\w-]+)/)?.[1] ?? 'text';
    if (!isBlock) {
      return (
        <code
          className="bg-secondary text-foreground rounded px-1 py-0.5 font-mono text-[0.85em]"
          {...rest}
        >
          {children}
        </code>
      );
    }
    const raw = String(children).replace(/\n$/, '');
    return (
      <CodeBlock language={lang} text={raw} highlightedHtml={undefined}>
        {children}
      </CodeBlock>
    );
  },
  pre: ({ node: _node, children }) => <>{children}</>,
};

interface CodeBlockProps {
  language: string;
  text: string;
  /** rehype-highlight 高亮后的 children */
  children: React.ReactNode;
  /** 兼容字段（rehype-highlight 不返回 raw html） */
  highlightedHtml?: string;
}

export function CodeBlock({ language, text, children }: CodeBlockProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <div className="border-border/40 bg-secondary/30 group my-3 overflow-hidden rounded-lg border">
      <div className="border-border/40 bg-secondary/40 flex items-center justify-between border-b px-3 py-1">
        <span className="text-muted-foreground font-mono text-[10px] uppercase tracking-wider">
          {language}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[10px]"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> {t('markdown.copied', { defaultValue: '已复制' })}
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> {t('markdown.copy', { defaultValue: '复制' })}
            </>
          )}
        </button>
      </div>
      <pre className="scroll-thin overflow-x-auto px-3 py-2 text-[12px] leading-relaxed">
        <code className={cn('font-mono', `language-${language}`)}>{children}</code>
      </pre>
    </div>
  );
}
