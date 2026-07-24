import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // dev 프록시: /api/* 요청을 백엔드로 넘긴다.
    // .env의 VITE_API_BASE_URL=/api/v1 과 짝을 이뤄 CORS 없이 상대경로로 호출.
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
})
