import { QueryClient } from '@tanstack/react-query'

// 앱 전역에서 사용할 단일 QueryClient 인스턴스.
// App 렌더 밖에서 생성해 리렌더 시 재생성되지 않도록 한다.
// 기본 옵션은 최소 구성으로 유지한다.
export const queryClient = new QueryClient()
