/**
 * BranchSwitcher · ‹ N/M › 兄弟分支切换。
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  variantIndex: number;
  variantCount: number;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
}

export function BranchSwitcher({ variantIndex, variantCount, onPrev, onNext, disabled }: Props) {
  return (
    <span className="border-border/40 inline-flex items-center gap-0.5 rounded border px-1 text-[10px]">
      <button
        type="button"
        onClick={onPrev}
        disabled={disabled === true || variantCount < 2}
        className="hover:text-foreground disabled:opacity-40"
        aria-label="上一个分支"
      >
        <ChevronLeft className="h-3 w-3" />
      </button>
      <span className="px-1 tabular-nums">
        {variantIndex + 1}/{variantCount}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={disabled === true || variantCount < 2}
        className="hover:text-foreground disabled:opacity-40"
        aria-label="下一个分支"
      >
        <ChevronRight className="h-3 w-3" />
      </button>
    </span>
  );
}
