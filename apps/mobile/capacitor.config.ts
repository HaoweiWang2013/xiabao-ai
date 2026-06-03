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
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
