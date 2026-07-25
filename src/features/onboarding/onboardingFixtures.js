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

const DEFAULT_PROGRESS = {
  onboardingCompleted: false,
  introSeen: false,
  // 'PROFILE' | 'AVAILABILITY' | 'FIXED' | 'CALENDAR' | 'DONE'
  currentStep: 'PROFILE',
  profile: null, // { name, purpose, timezone, weekStartDay } — set by ONB-02
  tutorialCompleted: false,
  tutorialSkipped: false,
  // 0 = not started; 1..6 = TUT-03(생성)~08(완료) 진행 인덱스.
  tutorialStep: 0,
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

// ONB-09 "가져올 캘린더의 일정 목록" — provider가 연결·캘린더 선택을 마친 다음
// 보여줄 후보 이벤트. 실제 외부 캘린더 API 연동이 없으므로 provider와 무관하게
// 고정된 샘플 목록을 돌려준다([가정-확장] — 실 Swagger 없음, provider 인자는
// 나중에 실제로 provider별 목록이 갈릴 수 있다는 자리만 잡아 둔다).
const importCandidates = [
  { id: 'imp-1', title: '주간 팀 회의', start: '2026-07-28T10:00:00', end: '2026-07-28T11:00:00' },
  { id: 'imp-2', title: '헬스장 PT', start: '2026-07-28T19:00:00', end: '2026-07-28T20:00:00' },
  { id: 'imp-3', title: '스터디 모임', start: '2026-07-30T20:00:00', end: '2026-07-30T22:00:00' },
]

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

  async getImportCandidates() {
    await delay(80)
    return importCandidates.map((e) => ({ ...e }))
  },

  // decisions: [{ eventId, mode: 'AS_IS'|'EDITED'|'EXCLUDED' }]. Nothing is
  // actually persisted server-side in mock mode beyond acknowledging receipt —
  // the real contract's shape is unconfirmed, so this returns the decisions
  // back unchanged rather than inventing a stored-events model.
  async submitImportDecisions(provider, decisions) {
    await delay()
    return { provider, decisions, appliedAt: new Date().toISOString() }
  },
}

export default onboardingMockBackend
