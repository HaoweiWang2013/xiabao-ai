import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.xiabao.app',
  appName: 'XiabaoAI',
  webDir: '../web/dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorNodeJS: {
      nodeDir: 'nodejs',
    },
  },
};

export default config;
