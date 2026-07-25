/*
  Single copy catalog for ST-F1-13 (온보딩·튜토리얼) — same "one catalog, P4 grep
  audits it once" principle violationMessages.js already established for V1~V7.
  Every user-facing string the onboarding wizard/tutorial renders lives here so
  a future real copy pass (Jonnathan/결정문 확정) touches exactly one file.

  [가정] INTRO_PAGES: the FE-1 작업지시 AC1 locks ONE constraint precisely —
  "AI기능" must appear 0 times, because every RB- feature is rule-based, not
  LLM (core-features.md §6). The exact final wording (결정문 §4.3) is not
  present in this checkout's `.agent-team/` mirror, so this copy is written
  fresh to satisfy that constraint and the raw user-story outcome text
  (ONB-01: "프로젝트, 주간 계획, 수행 이력 중심 서비스임을 이해한다") — flagged
  for a real-copy swap once §4.3 is available, not asserted as final.
*/
export const INTRO_PAGES = [
  {
    title: '프로젝트로 할 일을 정리해요',
    body: '프로젝트 안에 태스크를 만들고, 예상 시간과 우선순위를 정해 두면 언제 무엇을 해야 할지가 분명해집니다.',
  },
  {
    title: '주간 계획으로 시간에 배치해요',
    body: '가용 시간과 고정 일정을 기준으로 태스크를 캘린더에 배치하고, 수행 이력은 통계에서 다시 확인할 수 있습니다.',
  },
]

// 스텝퍼 4단계 라벨 (SCR-ONB-* 위저드).
export const WIZARD_STEPS = [
  { key: 'PROFILE', label: '프로필' },
  { key: 'AVAILABILITY', label: '가용 시간' },
  { key: 'FIXED', label: '고정 일정' },
  { key: 'CALENDAR', label: '캘린더 연동' },
]

// ONB-02 "사용 목적" — 정본 목록 부재로 [가정] 4지 선다 + 자유 서술 없음(단순화).
export const PURPOSE_OPTIONS = [
  { value: 'STUDY', label: '학업' },
  { value: 'WORK', label: '업무' },
  { value: 'PERSONAL_PROJECT', label: '개인 프로젝트' },
  { value: 'OTHER', label: '기타' },
]

// [가정] 지원 시간대 목록 — 서비스가 한국어 UI 전용이라 KST를 기본값으로 두고,
// 나머지는 흔한 예시만 최소로 곁들인다(전체 IANA 목록은 이 스토리 범위 밖).
export const TIMEZONE_OPTIONS = [
  { value: 'Asia/Seoul', label: '서울 (UTC+9)' },
  { value: 'Asia/Tokyo', label: '도쿄 (UTC+9)' },
  { value: 'America/Los_Angeles', label: '로스앤젤레스 (UTC-8)' },
  { value: 'UTC', label: 'UTC' },
]

// ONB-09 "각 일정에 대해 반영 방식 선택" — 원문 3택 그대로.
export const IMPORT_REFLECT_MODES = [
  { value: 'AS_IS', label: '그대로 반영' },
  { value: 'EDITED', label: '수정 후 반영' },
  { value: 'EXCLUDED', label: '제외' },
]

export const onboardingCopy = {
  intro: {
    skip: '건너뛰기', // 초대 화면 자체엔 AC상 건너뛰기 언급이 없어 다음 이동만 제공 — 아래 next/start만 사용
    next: '다음',
    start: '시작하기',
  },
  wizard: {
    heading: '시작하기 전에 몇 가지만 설정할게요',
    next: '다음',
    back: '이전',
    finish: '완료',
    later: '나중에 하기', // 캘린더 단계 전용 (AC2 "캘린더 단계만 [나중에 하기]")
    savedHint: '저장 후 다음으로 진행할 수 있습니다',
    unsavedHint: '변경 사항을 저장해 주세요',
    resumeToast: '이어서 설정합니다',
  },
  profile: {
    heading: '프로필을 알려주세요',
    nameLabel: '이름',
    namePlaceholder: '표시할 이름을 입력하세요',
    purposeLabel: '사용 목적',
    timezoneLabel: '시간대',
    weekStartLabel: '주 시작 요일',
    nameRequired: '이름을 입력해 주세요',
  },
  availability: {
    heading: '가용 시간이 무엇인가요',
    body: '가용 시간은 하루 24시간 중 실제로 계획에 쓸 수 있는 시간대입니다. 공통 시작·종료 시간을 정하면 첫 주간 계획의 기준이 됩니다.',
  },
  fixed: {
    heading: '고정 일정이 무엇인가요',
    body: '수업·회의·근무처럼 매주 반복되고 다른 일을 배치할 수 없는 시간입니다. 등록해 두면 이후 계획에서 자동으로 자리를 비워 둡니다.',
    skipHint: '반복되는 일정이 없다면 바로 다음으로 진행해도 됩니다',
  },
  calendar: {
    heading: '외부 캘린더를 연결해 볼까요',
    body: 'Google·Apple 캘린더를 연결하면 기존 일정을 OpenPlan으로 가져올 수 있습니다. 지금 하지 않아도 나중에 설정에서 언제든 연결할 수 있습니다.',
    importHeading: '가져올 일정을 확인하세요',
    importBody: '각 일정을 그대로 반영할지, 수정 후 반영할지, 제외할지 선택하세요.',
    noCalendarConnected: '연결된 캘린더가 없습니다 — 위에서 먼저 연동해 주세요',
    submitImport: '선택한 대로 반영',
    importSubmitted: '가져오기 설정을 반영했습니다',
  },
  tutorial: {
    kickoffTitle: '핵심 조작을 실습해 볼까요',
    kickoffBody:
      '샘플 프로젝트 생성부터 태스크 추가, 캘린더 배치, 일정 추가, 삭제까지 실제 화면에서 그대로 따라 해 봅니다.',
    start: '시작하기',
    skip: '건너뛰기',
    next: '다음',
    prev: '이전',
    done: '완료',
    progressLabel: (n, total) => `${n}/${total}`,
    restartTitle: '튜토리얼을 다시 시작할까요?',
    // Thomas 리뷰 MAJOR fix — 이전 문구는 "정리한 뒤 시작합니다"라고 약속했지만
    // 실제 재시작 동작(SettingsLayout.confirmRestart)은 잔존 샘플을 정리하지
    // 않는다(그 함수 자신의 [한계] 주석 참고 — 실기능으로 만들어진 샘플이라
    // 안전하게 식별할 방법이 없다). 문구를 실제 동작에 맞춰 정정.
    restartBody: '처음부터 다시 안내받습니다. 지금까지의 튜토리얼 진행 상태가 초기화됩니다.',
    restartConfirm: '다시 시작',
    restartCancel: '취소',
    completeTitle: '튜토리얼을 완료했습니다',
    completeBody: '이제 실제 프로젝트와 계획을 자유롭게 만들어 보세요.',
    completeCta: '대시보드로 이동',
  },
}

export default onboardingCopy
