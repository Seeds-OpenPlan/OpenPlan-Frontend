import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// 서비스워커는 프로덕션 빌드에서만 등록한다. dev에서 등록하면 vite dev
// 서버의 HMR/프록시(/api)와 섞여 디버깅이 꼬일 수 있어서 의도적으로
// 막는다(public/sw.js 자체도 /api와 정적 자산은 건드리지 않지만, dev에는
// 애초에 서비스워커가 끼어들 이유가 없다). load 이벤트 뒤로 미루는 이유는
// 등록 자체가 네트워크 요청을 유발해 초기 페이지 로드와 경쟁하지 않게
// 하기 위함이다. 등록 실패는 TWA 설치 가능 여부에만 영향을 주고 앱 동작엔
// 영향이 없으므로 조용히 무시한다.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
