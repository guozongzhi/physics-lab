import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig({
  // SPA 使用根路径部署：深层路由刷新时静态资源仍从 /assets 加载。
  base: '/',
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        // 大体积依赖拆分为独立 chunk，避免首屏单文件过大
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-icons': ['lucide-react'],
          'vendor-charts': ['recharts'],
          'vendor-motion': ['framer-motion'],
          'vendor-markdown': ['react-markdown'],
        },
      },
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    tsconfigPaths()
  ],
})
