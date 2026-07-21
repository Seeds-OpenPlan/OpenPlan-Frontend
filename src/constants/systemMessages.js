/*
  System-state copy for the SYS-01~07 common-state surfaces. Confirmed strings
  from ui-spec §9.4 (Jonnathan). This is the single source for these surfaces'
  Korean copy — do NOT duplicate any of these into violationMessages.js, which
  the P4 grep audit treats as a separate catalog (story §9.2 G-copy).

  All copy passes the §COPY forbidden-word catalog (ui-spec §0.2): no bare
  apologies, no leaked technical terms (Exception/null/HTTP codes), no blame,
  no vague passive voice, no English state words, no emoji status icons.
*/
export const systemMessages = {
  // SYS-01 · SCR-404
  notFound: {
    title: '페이지를 찾을 수 없습니다',
    body: '요청하신 주소가 잘못되었거나 존재하지 않습니다.',
    home: '홈으로 이동',
    back: '이전 화면으로 가기',
  },

  // SYS-06 · SCR-403
  forbidden: {
    title: '이 화면에 접근할 수 없습니다',
    body: '이 콘텐츠에 접근할 권한이 없습니다.', // default when details.reason is absent
    back: '접근 가능한 화면으로',
    home: '홈으로 이동',
  },

  // SYS-02 · PTN-ERROR (copy varies by method — see ui-spec §3)
  error: {
    getTitle: '불러오지 못했습니다',
    writeTitle: '요청을 처리하지 못했습니다',
    pageTitle: '문제가 발생했습니다',
    pageBody: '일시적인 오류일 수 있습니다. 새로고침 후 다시 시도해 주세요.',
    sectionBody: '이 영역을 불러오지 못했습니다',
    retry: '다시 시도',
    refresh: '새로고침',
  },

  // SYS-03 · PTN-LOADING (processing state)
  loading: {
    processing: '처리 중',
    processingBannerTitle: '현재 처리 중인 작업이 있습니다',
    processingBannerBody: '잠시만 기다려 주세요',
    announce: '불러왔습니다', // aria-live announcement when content arrives
  },

  // SYS-04 · PTN-UNSAVED
  unsaved: {
    title: '저장하지 않은 변경 사항이 있습니다',
    body: '나가면 변경 내용이 사라집니다.',
    stay: '계속 편집',
    leave: '나가기',
  },

  // SYS-05 · OVL-CONFLICT
  conflict: {
    title: '변경 사항이 충돌했습니다',
    body: '다른 곳에서 이미 이 항목이 저장되었습니다. 내 변경은 아직 반영되지 않았습니다.',
    latestInfoLabel: '최신 저장 정보',
    savedSuffix: '저장됨',
    options: {
      accept: {
        title: '최신 데이터 수용',
        body: '최신 내용을 그대로 반영하고 내 변경은 버립니다',
        action: '최신 데이터로 보기',
      },
      retry: {
        title: '내 변경 재시도',
        body: '최신 내용 위에 내 변경을 다시 적용해 검토합니다',
        action: '내 변경 다시 검토',
      },
      compare: {
        title: '비교',
        body: '무엇이 달라졌는지 항목별로 봅니다',
        action: '비교하기',
      },
    },
    acceptedToast: '최신 내용을 반영했습니다',
  },

  // SYS-07 · PTN-OFFLINE
  offline: {
    banner: '오프라인 상태입니다 · 저장이 비활성화됩니다',
    disabledReason: '오프라인 상태입니다',
    recoveredToast: '다시 연결되었습니다',
  },
}

export default systemMessages
