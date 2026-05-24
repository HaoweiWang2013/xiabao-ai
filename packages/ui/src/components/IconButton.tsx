import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/utils';

const iconButtonVariants = cva(
  'focus-visible:ring-ring inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        ghost: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        outline: 'border-border/60 text-foreground hover:bg-secondary border',
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'text-destructive hover:bg-destructive/10 hover:text-destructive',
      },
      size: {
        sm: 'h-7 w-7',
        md: 'h-9 w-9',
        lg: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'ghost', size: 'md' },
  },
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
IconButton.displayName = 'IconButton';
