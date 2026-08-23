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
    // 🔴 target이 https인 이유 (2026-08-23 실측): 실서버 nginx가 http를
    // https로 301 강제하도록 바뀌었다. target을 http로 두면 프록시가 데이터
    // 대신 301을 돌려주고, 301은 네트워크 오류도 404 E-COM-004도 아니라서
    // withDevFallback의 mock 폴백조차 안 걸린다 — 화면이 통째로 실패한다.
    // secure:false는 인증서 검증을 끄는 것: 도메인이 아직 없어 인증서가 raw
    // IP(13.208.66.211)에 대해 발급돼 검증이 실패한다. 도메인이 붙으면 이
    // 옵션은 지워야 한다.
    proxy: {
      '/api': { target: 'https://13.208.66.211', changeOrigin: true, secure: false },
    },
  },
})
