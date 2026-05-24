/**
 * 设计令牌 · 见 docs/12-ui-design.md §2
 */

export const ACCENT_GREEN = {
  50: '#F0FDF4',
  100: '#DCFCE7',
  200: '#BBF7D0',
  300: '#86EFAC',
  400: '#4ADE80',
  500: '#22C55E',
  600: '#16A34A',
  700: '#15803D',
  800: '#166534',
  900: '#14532D',
  950: '#052E16',
} as const;

export const RADIUS = {
  sm: '4px',
  DEFAULT: '8px',
  md: '10px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  full: '9999px',
} as const;

export const DURATION = {
  fast: 120,
  DEFAULT: 180,
  slow: 240,
} as const;

/**
 * Accent 色板 · 强调色（--primary / --ring / --success）
 *
 * 每个值是 HSL 三元组字符串（与 css-variables.css 兼容，省略 hsl() 包装）。
 * primaryFg 用作 --primary-foreground，确保按钮文字在 primary 背景上有足够对比度。
 */
export interface AccentTokens {
  primary: string;
  primaryFg: string;
  ring: string;
}

export type AccentId = 'green' | 'blue' | 'purple' | 'orange' | 'pink' | 'gray';

export const ACCENT_HSL: Record<AccentId, { light: AccentTokens; dark: AccentTokens }> = {
  green: {
    light: { primary: '142 71% 45%', primaryFg: '0 0% 100%', ring: '142 71% 45%' },
    dark: { primary: '142 76% 56%', primaryFg: '120 11% 5%', ring: '142 76% 56%' },
  },
  blue: {
    light: { primary: '217 91% 60%', primaryFg: '0 0% 100%', ring: '217 91% 60%' },
    dark: { primary: '217 91% 65%', primaryFg: '222 47% 11%', ring: '217 91% 65%' },
  },
  purple: {
    light: { primary: '271 81% 56%', primaryFg: '0 0% 100%', ring: '271 81% 56%' },
    dark: { primary: '271 81% 70%', primaryFg: '271 81% 12%', ring: '271 81% 70%' },
  },
  orange: {
    light: { primary: '24 95% 53%', primaryFg: '0 0% 100%', ring: '24 95% 53%' },
    dark: { primary: '24 95% 60%', primaryFg: '24 60% 12%', ring: '24 95% 60%' },
  },
  pink: {
    light: { primary: '330 81% 60%', primaryFg: '0 0% 100%', ring: '330 81% 60%' },
    dark: { primary: '330 81% 70%', primaryFg: '330 81% 12%', ring: '330 81% 70%' },
  },
  gray: {
    light: { primary: '240 6% 25%', primaryFg: '0 0% 100%', ring: '240 6% 25%' },
    dark: { primary: '240 5% 80%', primaryFg: '240 6% 10%', ring: '240 5% 80%' },
  },
};
