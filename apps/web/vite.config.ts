import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'XiabaoAI',
        short_name: 'XiabaoAI',
        description: '聚合型 AI 客户端 · 一个 App 统一接入多家 AI 服务',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b0f0a',
        theme_color: '#22C55E',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/trpc/,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/api\//,
            handler: 'NetworkOnly',
            options: {
              backgroundSync: { name: 'api-queue', options: { maxRetentionTime: 24 * 60 } },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\.(?:woff2?|ttf|eot)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
  optimizeDeps: {
    exclude: ['@xiabao/app-ui', '@xiabao/state', '@xiabao/ui', '@xiabao/theme'],
    // 强制预构建这些 ESM 依赖，避免 rollup 直接打包它们的源码 .mjs
    // （vite 5.3.x + sourcemap 下会报 "Can't resolve original location of error"）
    include: ['jotai', '@tanstack/react-query'],
  },
  build: {
    target: 'es2022',
    // 关闭 sourcemap：vite 5.3.5 在 sourcemap 模式下打包含 `import.meta.env` 的
    // ESM 依赖（jotai / @tanstack/react-query 的 .mjs）会抛
    // "Can't resolve original location of error"。升级 vite 后如需 sourcemap 可恢复 true。
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
});
