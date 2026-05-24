import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 合并 Tailwind class · 参考 shadcn/ui 惯例 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
