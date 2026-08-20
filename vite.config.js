import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // dev 프록시: /api/* 요청을 백엔드로 넘긴다.
    // .env의 VITE_API_BASE_URL=/api/v1 과 짝을 이뤄 CORS 없이 상대경로로 호출.
    //
    // 대상은 실서버다(2026-08-18 팀장 지시). localhost:8080 로컬 스텁을 보고
    // 있으면 DevUserAuthFilter가 모든 요청을 인증된 것으로 통과시켜, 인증을
    // 아무리 실연결해도 화면에서는 항상 통과로만 보인다 — 왕복 검증 자체가
    // 성립하지 않는다. 로컬 BE로 되돌릴 때만 target을 localhost:8080으로.
    //
    // 소셜 로그인도 이 프록시를 탄다: 브라우저가 /api/v1/auth/oauth/{provider}로
    // 문서 이동하면 프록시가 실서버로 넘기고, 서버의 302가 그대로 브라우저에
    // 돌아와 제공자 인가 페이지로 나간다(LoginPage.handleSocialSelect 참조).
    proxy: {
      '/api': { target: 'http://13.208.66.211', changeOrigin: true },
    },
  },
})
