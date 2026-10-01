/*
  약관·방침이 인용하는 운영자 값 — 코드에서 곧바로 읽어낼 수 없는 것만 여기 모았다.

  본문의 나머지 문장은 전부 저장소의 코드·스키마에서 확인한 사실이지만, 이 값들은
  거기 없다(운영 주체·책임자·연락처·인프라 사업자·시행일). 지어내면 그 순간 법적
  고지가 허위 사실이 되므로 한 파일에 모아 두고, 확정 전에는 화면에 확정 필요 표시가
  그대로 보이게 두었다 — 안 채운 채로 배포되면 눈에 띄어야 하니까.

  🟢 2026-09-01 로 다섯 값이 모두 확정되어 확정 필요 표시는 남아 있지 않다.
     다시 미확정 값이 생기면 '[운영자 확정 필요]' 를 그대로 넣을 것 — 화면에 노출되는
     것이 이 파일의 설계다.

  구글 OAuth 심사는 이 페이지의 URL 을 직접 열어 확인한다. 확정 값을 채운 뒤
  배포해야 심사에 제출할 수 있다.

  ⚠️ cloudProvider·mailProvider 는 추정이 아니라 배포 산출물에서 읽은 값이다(아래
     주석이 근거 위치). 인프라가 바뀌면 국가 표기와 함께 고쳐야 한다.
*/

export const OPERATOR = {
  /* 서비스 명칭. 대외 공식 표기가 'OpenPlan' 이 맞는지 확인 필요. */
  serviceName: 'OpenPlan',

  /*
    개인정보 보호책임자 성명. 2026-09-01 사용자 확정.
    직책은 붙이지 않았다 — 저장소 문서가 BE-1·FE-1 같은 역할 표기만 써서
    대외 직함이 확인되지 않는데, 없는 직함을 지어 적으면 제8조 전체가
    허위 고지가 된다. 대외 직함이 정해지면 '전창현 (직함)' 형태로 고칠 것.
  */
  privacyOfficer: '전창현',

  /* 문의 이메일. 2026-09-01 사용자 확정. */
  contactEmail: 'openplan06@gmail.com',

  /*
    클라우드 사업자.
    근거: .agent-team/09-docs/배포DB-진소희-접근권한-2026-08-28.md —
    운영 DB 는 RDS PostgreSQL `openplan-db`(db.t4g.micro), 엔드포인트
    openplan-db.….ap-northeast-3.rds.amazonaws.com. 애플리케이션은 EC2 1대.
    🔴 ap-northeast-3 = 일본 오사카 리전이다. 따라서 이것은 '위탁' 이 아니라
       '국외 이전' 고지 대상이다(제4조 2항에서 국가를 함께 밝힌다).
  */
  cloudProvider: 'Amazon Web Services, Inc. (Amazon EC2 · Amazon RDS)',
  cloudRegion: '일본 (아시아 태평양 오사카 리전)',

  /*
    인증 메일 발송 경로 사업자.
    근거: OpanPlan-Backend/deploy/bootstrap.sh:174 가 배포 필수값으로
    `MAIL_USERNAME  Gmail 주소` · `MAIL_PASSWORD  Gmail 앱 비밀번호 16자` 를
    요구하고, application.yaml:36 의 기본 호스트가 smtp.gmail.com 이다.
    🔴 application.yaml:33 주석은 "운영은 AWS SES" 라고 적어 두었으나 그것은
       실현되지 않은 계획이다 — 실제 배포 절차가 요구하는 것은 Gmail 이다.
       SES 로 전환하면 이 값과 아래 국가 표기를 함께 고쳐야 한다.
  */
  mailProvider: 'Google LLC (Gmail SMTP)',
  mailRegion: '미국',
}

/* 시행일. 2026-09-01 사용자 확정. */
export const EFFECTIVE_DATE = '2026년 9월 1일'
