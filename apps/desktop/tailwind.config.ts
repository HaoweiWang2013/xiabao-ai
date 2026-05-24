import type { Config } from 'tailwindcss';
import preset from '@xiabao/theme/tailwind-preset';

const config: Config = {
  presets: [preset as Config],
  content: [
    './src/renderer/**/*.{html,ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/app-ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
