import axios from 'axios'

// 백엔드 API 기본 주소. 빌드 시 Vite가 import.meta.env로 주입한다.
const baseURL = import.meta.env.VITE_API_BASE_URL

// 개발 환경에서 값이 없으면 명확히 경고한다.
// 상대경로('')로 폴백해 앱이 죽지 않도록만 하고, 인증/토큰 로직은 다루지 않는다.
if (import.meta.env.DEV && !baseURL) {
  console.warn(
    '[api] VITE_API_BASE_URL이 설정되지 않았습니다. ' +
      '.env(.local)에 값을 지정하세요. 현재는 상대경로로 폴백합니다.',
  )
}

// 앱 전역에서 공유하는 단일 axios 인스턴스.
// baseURL, timeout, 기본 JSON 헤더만 최소 설정한다.
export const apiClient = axios.create({
  baseURL: baseURL ?? '',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 공통 요청 인터셉터 — 현재는 통과만 한다.
// 인증 토큰 주입 등은 아직 구현하지 않는다.
apiClient.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error),
)

// 공통 응답 인터셉터 — 현재는 통과만 한다.
// 재로그인/토큰 갱신/오류 화면 처리는 아직 구현하지 않는다.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error),
)

export default apiClient
