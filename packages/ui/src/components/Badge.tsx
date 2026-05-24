import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary border-transparent',
        secondary: 'bg-secondary text-secondary-foreground border-transparent',
        outline: 'border-border text-foreground',
        success: 'bg-success/15 text-success border-transparent',
        warning: 'bg-warning/15 text-warning border-transparent',
        info: 'bg-info/15 text-info border-transparent',
        destructive: 'bg-destructive/15 text-destructive border-transparent',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
