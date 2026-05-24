import { ACCENT_GREEN, RADIUS } from './tokens';

import type { Config } from 'tailwindcss';

const preset: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 语义色 → 由 CSS 变量驱动（css-variables.css）
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        warning: 'hsl(var(--warning) / <alpha-value>)',
        info: 'hsl(var(--info) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        accent: ACCENT_GREEN,
      },
      borderRadius: {
        sm: RADIUS.sm,
        DEFAULT: RADIUS.DEFAULT,
        md: RADIUS.md,
        lg: RADIUS.lg,
        xl: RADIUS.xl,
        '2xl': RADIUS['2xl'],
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glass: '0 4px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.08)',
        'glass-lg': '0 16px 48px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.1)',
      },
      backdropBlur: {
        glass: '16px',
      },
      transitionTimingFunction: {
        emphasis: 'cubic-bezier(0.2, 0.8, 0.2, 1.0)',
      },
      transitionDuration: {
        fast: '120ms',
        DEFAULT: '180ms',
        slow: '240ms',
      },
      zIndex: {
        sticky: '10',
        header: '20',
        dropdown: '30',
        tooltip: '40',
        backdrop: '50',
        modal: '51',
        palette: '60',
        toast: '70',
        drag: '100',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-bottom': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms var(--ease-out)',
        'fade-up': 'fade-up 140ms var(--ease-out)',
        'slide-in-bottom': 'slide-in-bottom 180ms var(--ease-out)',
        'scale-in': 'scale-in 140ms var(--ease-emphasis)',
      },
    },
  },
};

export default preset;
