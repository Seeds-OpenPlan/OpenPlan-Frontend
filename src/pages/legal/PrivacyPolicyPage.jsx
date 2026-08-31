import { LegalShell, LegalSection, LegalList } from './LegalShell'
import { OPERATOR, EFFECTIVE_DATE } from './legalOperator'

/*
  개인정보처리방침 (SCR-LEGAL-PRIVACY).

  🔴 이 문서의 모든 사실 진술은 2026-08-31 기준 `origin/main` 코드에서 확인한
  것만 적었다. 각 항목 옆 주석이 근거 위치다. 기능이 바뀌면 이 문서도 같이
  바뀌어야 한다 — 특히 아래 셋은 바뀌면 방침이 곧바로 거짓이 되는 자리다.
    · 수집 항목  → V1__baseline.sql 의 테이블 컬럼
    · 국외 이전  → OpenPlan-AI 의 모델 라우팅(app/router/model_router.py)
    · 보유 기간  → users.scheduled_deletion_at 과 ON DELETE CASCADE

  용어는 `OpenPlan문서/00.OpenPlan 용어집 - 시트1.csv` 를 따른다(태스크·고정
  일정·가용 시간·주간 계획안·수행 이력·재계획 대안·수행 통계·외부 일정 연동).
*/
export function PrivacyPolicyPage() {
  return (
    <LegalShell title="개인정보처리방침" effectiveDate={EFFECTIVE_DATE}>
      <p className="text-body text-text">
        {OPERATOR.serviceName}(이하 &lsquo;서비스&rsquo;)는 이용자의 개인정보를 소중히 다루며,
        「개인정보 보호법」을 비롯한 관계 법령을 준수합니다. 이 방침은 서비스가 어떤 정보를
        어떤 목적으로 수집하고, 얼마 동안 보관하며, 이용자가 무엇을 요구할 수 있는지를 밝힙니다.
      </p>

      {/* 근거: V1__baseline.sql — users / user_profiles / external_calendar_* */}
      <LegalSection heading="제1조 (수집하는 개인정보 항목)">
        <p>서비스는 다음 정보를 수집합니다.</p>
        <p className="font-medium">1. 회원가입 시 (필수)</p>
        <LegalList
          items={[
            '이메일 주소 — 계정 식별자이자 인증 메일 수신처',
            '비밀번호 — 원문은 저장하지 않으며 복원할 수 없는 형태(해시)로만 보관합니다',
          ]}
        />
        <p className="font-medium">2. 소셜 로그인으로 가입한 경우 (필수)</p>
        <LegalList
          items={[
            '이용한 제공자 구분(구글·네이버·카카오)과 제공자가 발급한 회원 식별자',
            '소셜 로그인 계정은 비밀번호를 수집하지 않습니다',
          ]}
        />
        <p className="font-medium">3. 사용자 기본 설정 (온보딩 단계)</p>
        <LegalList
          items={[
            '이름',
            '사용 목적 (선택 입력)',
            '시간대, 주 시작 요일',
          ]}
        />
        <p className="font-medium">4. 서비스를 이용하는 동안 생성되는 정보</p>
        <LegalList
          items={[
            '프로젝트, 태스크, 세부 작업(WBS)',
            '고정 일정, 가용 시간',
            '주간 계획안과 확정한 계획, 재계획 대안',
            '수행 이력(실제 사용 시간, 완료 여부 등)과 수행 통계',
            '알림 설정, 고객 문의 내역',
          ]}
        />
        <p className="font-medium">5. 외부 일정 연동을 사용하는 경우 (선택)</p>
        <LegalList
          items={[
            '연동한 캘린더 계정의 식별자',
            '가져온 일정의 제목, 시작·종료 시각, 원본 캘린더 이름',
            '제공자가 발급한 접근 토큰·갱신 토큰 (암호화하여 보관, 제5조 참조)',
          ]}
        />
        <p className="font-medium">6. 자동으로 생성되는 정보</p>
        <LegalList
          items={[
            '서비스 접속 과정에서 웹 서버 기록으로 남는 접속 일시, 접속 IP 주소, 브라우저 정보',
          ]}
        />
        <p className="text-label text-text-muted">
          서비스는 주민등록번호, 연락처, 생년월일, 결제 정보를 수집하지 않습니다.
        </p>
      </LegalSection>

      <LegalSection heading="제2조 (개인정보의 이용 목적)">
        <LegalList
          items={[
            '회원 식별과 로그인 상태 유지, 이메일 인증 및 비밀번호 재설정',
            '주간 계획안 생성과 계획 검증(겹침·가용 시간 초과 등), 재계획 대안 제시',
            '수행 이력 기록과 수행 통계 제공',
            '설정한 조건에 따른 알림 발송',
            '외부 일정 연동을 통해 가져온 일정의 계획 반영',
            '고객 문의 접수와 응대',
            '비정상 접근 차단 등 서비스 보안 유지',
          ]}
        />
      </LegalSection>

      {/* 근거: users.scheduled_deletion_at "30일 복구창"(ACCT-04/06) · 전 테이블 ON DELETE CASCADE */}
      <LegalSection heading="제3조 (보유 및 이용 기간)">
        <LegalList
          items={[
            '이용자가 계정 비활성화를 요청하면 계정은 즉시 비활성화되고, 30일이 지나도 재활성화하지 않으면 삭제됩니다. 그 기간 안에는 이용자가 직접 재활성화할 수 있습니다.',
            '계정이 삭제되면 그 계정에 속한 프로젝트·태스크·계획·수행 이력·문의 내역 등 위 제1조의 정보가 함께 삭제됩니다.',
            '외부 일정 연동을 해제하면 해당 연동의 토큰과 가져온 일정 정보는 그 시점에 삭제됩니다.',
            '관계 법령이 별도의 보존 기간을 정한 경우에는 그 기간 동안 보관합니다.',
          ]}
        />
      </LegalSection>

      {/*
        근거: OpenPlan-AI app/models/schemas.py — 요청 스키마에 title·memo·name·email
        필드가 하나도 없다. BE 가 보내는 것은 PlanSnapshot(rule/model/PlanSnapshot.java)
        과 TaskFacts(dueDate·wbsStart·wbsEnd·estimatedMinutes·priority)뿐이라
        태스크 제목·메모는 모델 호출 경계를 넘지 않는다. 이 문단은 그 사실이 바뀌면
        가장 먼저 거짓이 되는 자리다.
      */}
      <LegalSection heading="제4조 (개인정보의 제3자 제공 및 처리 위탁)">
        <p>서비스는 이용자의 개인정보를 제3자에게 판매하거나 제공하지 않습니다. 다만 서비스 제공에 필요한 범위에서 다음의 처리를 위탁합니다.</p>
        <p className="font-medium">1. 주간 계획안 생성을 위한 인공지능 모델 호출</p>
        <LegalList
          items={[
            '위탁받는 자 · 이전되는 국가: 인공지능 모델 제공사(해외 사업자를 포함하며, 서비스 구성에 따라 달라집니다)',
            '이전되는 항목: 계획 배치에 필요한 날짜와 시각, 예상 소요 시간, 우선순위, 각 태스크·일정을 가리키는 임의의 식별자(UUID)',
            '이전되지 않는 항목: 태스크와 일정의 제목·메모·설명, 이메일 주소, 이름 — 이 정보들은 서버 밖으로 전달되지 않습니다',
            '이전 일시 및 방법: 이용자가 계획 생성을 요청하는 시점에 암호화된 통신으로 전송',
            '보유 기간: 요청 처리에 필요한 시간 동안만 이용되며 서비스는 별도로 저장하지 않습니다',
          ]}
        />
        <p className="text-label text-text-muted">
          인공지능 모델 호출이 실패하더라도 서비스는 자체 규칙 기반 배치로 계획안을 만들어 제공합니다.
        </p>
        <p className="font-medium">2. 서비스 운영 인프라</p>
        <LegalList
          items={[
            `클라우드 서버 및 데이터베이스 운영: ${OPERATOR.cloudProvider}`,
            `인증 메일 발송: ${OPERATOR.mailProvider}`,
          ]}
        />
        <p className="font-medium">3. 외부 일정 연동</p>
        <p>
          외부 일정 연동은 이용자가 직접 동의한 범위에서 해당 캘린더 제공자로부터 일정을 <b>가져오는</b> 기능입니다.
          서비스가 이용자의 정보를 캘린더 제공자에게 제공하지는 않습니다. 연동은 설정 화면에서 언제든 해제할 수 있습니다.
        </p>
      </LegalSection>

      {/* 근거: password_hash · auth_sessions.refresh_token_hash · access_token_enc(AES-GCM) · nginx-https.conf */}
      <LegalSection heading="제5조 (개인정보의 안전성 확보 조치)">
        <LegalList
          items={[
            '비밀번호는 복원할 수 없는 해시로 저장하며, 서비스 운영자도 원문을 알 수 없습니다.',
            '로그인 상태를 유지하는 토큰은 원문이 아니라 해시로 저장합니다.',
            '외부 캘린더 제공자가 발급한 접근·갱신 토큰은 AES-GCM 방식으로 암호화하여 저장하며 평문으로는 보관하지 않습니다.',
            '서비스와 이용자 사이의 모든 통신은 HTTPS로 암호화합니다.',
            '개인정보에 접근할 수 있는 인원을 업무상 필요한 최소한으로 제한합니다.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="제6조 (이용자의 권리와 행사 방법)">
        <p>이용자는 언제든지 다음 권리를 행사할 수 있습니다.</p>
        <LegalList
          items={[
            '자신의 개인정보에 대한 열람 요구',
            '오류가 있는 경우 정정 요구',
            '삭제 요구 및 처리 정지 요구',
          ]}
        />
        <p>
          이름은 <b>설정 &gt; 계정</b> 화면에서 직접 확인하고 고칠 수 있으며, 같은 화면에서 계정
          비활성화를 요청할 수 있습니다. 그 밖의 열람·정정·삭제·처리 정지 요구는 제8조의 연락처로
          문의해 주시면 지체 없이 처리합니다.
        </p>
      </LegalSection>

      <LegalSection heading="제7조 (만 14세 미만 아동의 개인정보)">
        <p>
          서비스는 만 14세 미만 아동의 회원가입을 받지 않으며, 만 14세 미만 아동의 개인정보를
          수집하지 않습니다.
        </p>
      </LegalSection>

      <LegalSection heading="제8조 (개인정보 보호책임자 및 문의처)">
        <p>개인정보 처리에 관한 문의·불만·피해 구제는 아래로 연락해 주시기 바랍니다.</p>
        <LegalList
          items={[
            `개인정보 보호책임자: ${OPERATOR.privacyOfficer}`,
            `문의 이메일: ${OPERATOR.contactEmail}`,
          ]}
        />
        <p className="text-label text-text-muted">
          그 밖의 개인정보 침해에 대한 신고·상담은 개인정보침해신고센터(privacy.kisa.or.kr, 국번없이 118),
          대검찰청 사이버수사과(spo.go.kr, 국번없이 1301), 경찰청 사이버수사국(ecrm.police.go.kr, 국번없이 182)에
          문의하실 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection heading="제9조 (방침의 변경)">
        <p>
          이 방침의 내용을 추가·삭제·수정할 때에는 변경 사항을 시행일 7일 전부터 서비스 공지사항을 통해
          알립니다. 다만 이용자 권리에 중대한 영향을 주는 변경은 30일 전에 알립니다.
        </p>
      </LegalSection>
    </LegalShell>
  )
}

export default PrivacyPolicyPage
