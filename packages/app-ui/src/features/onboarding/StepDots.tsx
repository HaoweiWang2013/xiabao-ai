import { cn } from '@xiabao/ui';

interface Props {
  current: number;
  total: number;
}

export function StepDots({ current, total }: Props) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const idx = i + 1;
        const isActive = idx === current;
        const isPast = idx < current;
        return (
          <div key={idx} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-all duration-300',
                isActive && 'bg-primary text-primary-foreground scale-110 shadow-sm',
                isPast && 'bg-primary/20 text-primary',
                !isActive && !isPast && 'bg-secondary text-muted-foreground',
              )}
            >
              {idx}
            </div>
            {idx < total && (
              <div
                className={cn(
                  'h-px w-4 transition-colors duration-300',
                  isPast ? 'bg-primary/40' : 'bg-border',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
