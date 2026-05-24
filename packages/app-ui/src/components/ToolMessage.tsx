/**
 * ToolMessage · 工具调用结果折叠卡
 */
import { Wrench } from 'lucide-react';

interface ResultPart {
  toolName?: string;
  resultJson?: string;
}

interface Props {
  results: ResultPart[];
}

export function ToolMessage({ results }: Props) {
  if (results.length === 0) return null;
  return (
    <div className="ml-10 flex flex-col gap-1">
      {results.map((r, i) => {
        let preview = r.resultJson ?? '';
        try {
          preview = JSON.stringify(JSON.parse(preview), null, 2);
        } catch {
          /* keep raw */
        }
        const truncated = preview.length > 800;
        if (truncated) preview = preview.slice(0, 800) + '\n…(已截断)';
        return (
          <details
            key={i}
            className="border-border/40 bg-secondary/30 group/tool overflow-hidden rounded-md border text-[11px]"
          >
            <summary className="hover:bg-secondary/60 flex cursor-pointer items-center gap-2 px-2 py-1.5">
              <Wrench className="text-muted-foreground h-3 w-3" />
              <span className="font-mono">{r.toolName ?? 'tool'}</span>
              <span className="text-muted-foreground">已返回结果</span>
            </summary>
            <pre className="scroll-thin border-border/40 max-h-64 overflow-auto whitespace-pre-wrap break-all border-t px-3 py-2 font-mono">
              {preview}
            </pre>
          </details>
        );
      })}
    </div>
  );
}
