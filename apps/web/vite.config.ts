import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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