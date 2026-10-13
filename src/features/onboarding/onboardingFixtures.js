/*
  DEV-ONLY in-memory mock backend for ST-F1-13. The story spec (02. 스토리 스펙
  §ST-B1-08) names a REAL contract — `onboarding-progress` GET/PATCH + contents
  — owned by BE-1, but this checkout's local server does not implement it yet,
  so every call below runs through onboardingApi.js's withDevFallback
  (planApi.js's shared rule) exactly like every other [가정-확장] settings
  resource in this codebase.

  `progress` is the one piece of state the whole wizard/tutorial reads and
  writes — AC2's "이탈 재진입 시 onboarding-progress로 위치 복원" means this
  object (not any page-local state) is the single source of truth for "where
  was the user".
*/

const MOCK_LATENCY_MS = 70
const delay = (ms = MOCK_LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms))

// Thomas 리뷰 MINOR fix — 이전 버전은 순수 인메모리 상태라 새로고침마다
// 리셋됐다. 기본값을 onboardingCompleted:true로 둬서 다른 스토리 개발 서버
// 테스트를 매번 가로막지 않게 했었는데, 그 대가로 이 스토리 자체를
// `/onboarding` 직접 진입으로 봐도 IntroPage가 즉시 `/`로 튕겨 위저드를 아예
// 볼 수 없었다(BLOCKER가 실제로 걸리는지 검증 불가했던 정황). localStorage에
// 영속해 두 요구를 동시에 만족한다: 저장값이 없는 첫 로드는 기본 false(신규
// 유저 = 온보딩 노출, 이 스토리 검증 가능) — 위저드를 한 번 완료하면
// onboardingCompleted:true가 저장되어 그 뒤로는 새로고침해도, 같은 브라우저의
// 다른 개발 서버 테스트도 튕기지 않는다.
const STORAGE_KEY = 'openplan-dev.onboarding-progress'

// tutorialStep/tutorialSkipped 삭제(2026-10 수정) — 이 둘은 실 계약
// `OnboardingProgress`에 없는 필드였다(onboardingApi.js 헤더 참조). 예전엔
// 여기서 영속해 주다 보니 dev에서만 튜토리얼이 멀쩡히 넘어가고, 실서버
// 앞에서는 매 클릭마다 킥오프로 되돌아가는 BLOCKER가 dev 검증을 통과한 채
// 배포까지 갔다. 이제 mock도 계약 그대로(tutorialCompleted만) 맞춰서, dev가
// 다시 그 경로를 그대로 재현/검증할 수 있게 한다 — 스텝 커서는
// features/tutorial/tutorialProgressStore.js가 (dev/운영 공통으로) 맡는다.
const DEFAULT_PROGRESS = {
  onboardingCompleted: false,
  introSeen: false,
  // 'PROFILE' | 'AVAILABILITY' | 'FIXED' | 'CALENDAR' | 'DONE'
  currentStep: 'PROFILE',
  profile: null, // { name, purpose, timezone, weekStartDay } — set by ONB-02
  tutorialCompleted: false,
  version: 1,
}

// Defensive — localStorage can throw (privacy mode, quota) or simply not
// exist (SSR/test runners); either falls back to DEFAULT_PROGRESS untouched.
function loadPersisted() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function persist(next) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // dev-only convenience — a write failure here must never break the mock.
  }
}

// Merged over DEFAULT_PROGRESS (not the raw stored object) so a field added
// to the shape later still gets its default even for a browser that
// persisted an older, narrower version.
let progress = { ...DEFAULT_PROGRESS, ...loadPersisted() }

// W6 계약 정합(2026-08-28): ONB-09 "가져올 캘린더의 일정 목록" 샘플 데이터와
// getImportCandidates/submitImportDecisions 목 메서드를 여기서 제거했다 — 그
// 둘이 흉내내던 `/onboarding/import-candidates`·`/onboarding/import-decisions`는
// 계약에 없던 [가정-신규] 엔드포인트였다(onboardingApi.js 헤더 참조). 캘린더
// 단계는 이제 settingsFixtures.js의 실 계약 mock(connections/events/application)
// 을 CalendarConnectionSection 재사용을 통해 그대로 쓴다.
export const onboardingMockBackend = {
  async getProgress() {
    await delay(60)
    return { ...progress }
  },

  async patchProgress(patch) {
    await delay()
    progress = { ...progress, ...patch, version: progress.version + 1 }
    persist(progress)
    return { ...progress }
  },
}

export default onboardingMockBackend
