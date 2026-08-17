import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // CVM 工作台通过 /apps/sales-commission/ 同源代理承载本应用。
  base: process.env.VITE_APP_BASE ?? '/',
  build: {
    // 沙箱环境禁止 rmSync，构建前手动清理 dist 即可
    emptyOutDir: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
