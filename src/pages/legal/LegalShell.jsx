import { Link } from 'react-router-dom'
import { BrandMarkIcon } from '../../components/auth/authIcons'

/*
  약관·개인정보처리방침 공용 문서 셸.

  AuthShell을 재사용하지 않는 이유: 저쪽은 `max-w-sm` 카드로, 입력 폼 한 벌을
  담으라고 만든 폭이다. 법적 고지 문서는 문단·목록·표가 이어지는 긴 글이라
  384px에 넣으면 한 줄에 대여섯 어절만 들어가 읽는 사람이 스크롤로만 읽게 된다.
  브랜드 헤더(마크+워드마크)는 같은 것을 쓰되 본문 폭만 문서용으로 넓힌다 —
  비인증 화면군에서 떨어져 나온 별개 디자인이 아니라 같은 화면군의 넓은 변형이다.

  이 화면은 세션 없이 열려야 한다(router.js의 AuthLayout 형제 트리에 매달린
  이유). 구글 OAuth 심사가 로그인하지 않은 상태로 이 URL을 직접 열어 확인하고,
  가입 화면의 동의 문구도 아직 계정이 없는 사람이 누른다.
*/
export function LegalShell({ title, effectiveDate, children }) {
  return (
    <div className="min-h-screen bg-surface-sunken">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Link
            to="/landing"
            className="flex items-center gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <BrandMarkIcon />
            <span className="text-title font-logo font-bold text-text">OpenPlan</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <article className="flex flex-col gap-6 rounded-card border border-border bg-surface p-5 md:p-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-heading font-bold text-text">{title}</h1>
            <p className="text-caption text-text-muted">시행일 {effectiveDate}</p>
          </div>
          {children}
        </article>

        <nav className="mt-6 flex justify-center gap-4 text-label text-text-muted">
          <Link
            to="/legal/terms"
            className="underline underline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            이용약관
          </Link>
          <Link
            to="/legal/privacy"
            className="underline underline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            개인정보처리방침
          </Link>
        </nav>
      </main>
    </div>
  )
}

/* 조(條) 하나. 제목과 본문의 간격·글자 크기를 두 문서가 공유하도록 묶어 둔다. */
export function LegalSection({ heading, children }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-title font-semibold text-text">{heading}</h2>
      <div className="flex flex-col gap-2 text-body text-text">{children}</div>
    </section>
  )
}

/* 본문 안의 항목 목록. 근거 표시가 붙는 줄이 많아 마커를 죽이고 들여쓰기로 센다. */
export function LegalList({ items }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-text-disabled">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

export default LegalShell
