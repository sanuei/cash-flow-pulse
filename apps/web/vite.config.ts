import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 不覆盖已有的 manifest.json（public/ 里的那个），只注册 SW
      manifest: false,
      workbox: {
        // 缓存 app shell（HTML/CSS/JS）
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // ⚠️ 关键：SPA 导航 fallback 默认会把所有导航请求返回 index.html，
        // 包括 window.location.href='/api/auth/google' 这种跳转 → 登录请求被 SW 拦截、
        // 永远到不了 Worker，于是又回登录页（反复出现的登录失败根因）。
        // denylist 让 /api/* 的导航绕过 SW，直接走网络到 Worker。
        navigateFallbackDenylist: [/^\/api\//],
        // 运行时缓存：API 请求（网络优先，失败时用缓存）
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cashflow\.soniclab\.cc\/api\//,
            handler: 'NetworkOnly',  // 不缓存 API,确保数据实时
            options: {
              cacheName: 'api-no-cache',
            },
          },
        ],
      },
    }),
  ],
  // base 默认 '/'，显式声明便于未来部署到子路径
  // 当前部署目标：https://cash-flow-pulse.pages.dev/（根路径）
  base: '/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787', // Workers dev server 默认端口
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // sourcemap 关掉以减小 bundle（生产 pages 部署不需要）
    sourcemap: false,
    // 代码分割：vendor 单独 chunk（recharts/react 单独，便于浏览器缓存）
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          recharts: ['recharts'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});