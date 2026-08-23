import { Link } from 'react-router-dom'
import { Badge } from '../common/Badge'
import { ErrorState } from '../common/ErrorState'

const MAX_VISIBLE = 5

/*
  S4 · 이번 주 프로젝트 (DASH-06 — ui-spec-dash.md §DASH.4). Each row IS the "프로젝트
  열기" affordance (no separate button in the reference design) — the whole row
  is a Link.

  `/projects/{id}` resolves via router.js's own redirect-only loader for
  the old workspace URL — it 302s straight to the projects-list accordion
  with this project's row pre-expanded (see ProjectsPage.jsx's own header for
  the full accordion-URL contract). This link needs no special-casing on
  that account; it's a plain route the app already owns end-to-end.

  계약 정합 delta (W6, 2026-08-23 — DashboardView): 실제 서버의
  `weeklyImpactProjects[]`는 `{projectId, name, impactBadges}`뿐이다 — 구
  버전이 그리던 진행바(`sharePercent`)와 메타 줄(`investedMinutes`·
  `availablePercent`·`unplacedCount`·`adjustCount`)은 계약에 아예 없는
  필드였다(당시 mock이 지어낸 값). 그 숫자들이 없으니 "이번 주 투입 시간이
  가용 대비 몇 %"라는 예전 화면의 핵심 정보 자체를 더 이상 보여줄 수 없다
  — 대신 서버가 실제로 주는 `impactBadges`(마감 임박/미배치 있음/실제 초과)를
  칩으로 렌더한다. 진행바·퍼센트·시간 텍스트는 모두 제거했다 — 없는 데이터를
  꾸며내는 대신 화면에서 뺐다(리드 지시와 동일한 원칙).
*/

const BADGE_COPY = {
  DEADLINE_SOON: { label: '마감 임박', tone: 'warning' },
  HAS_UNASSIGNED: { label: '미배치 있음', tone: 'warning' },
  ACTUAL_OVERRUN: { label: '실제 초과', tone: 'danger' },
}

export function ImpactList({ error = false, onRetry, projects = [] }) {
  if (error) {
    return (
      <section>
        <h2 className="mb-2 text-title font-semibold text-text">이번 주 프로젝트</h2>
        <ErrorState variant="section" onAction={onRetry} />
      </section>
    )
  }

  const visible = projects.slice(0, MAX_VISIBLE)

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-title font-semibold text-text">이번 주 프로젝트</h2>

      {visible.length === 0 ? (
        <p className="mt-3 text-label text-text-muted">이번 주에 영향 있는 프로젝트가 없습니다.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {visible.map((p) => {
            const badges = Array.isArray(p.impactBadges) ? p.impactBadges : []
            // aria-label에 배지 목록을 문장으로 병기 — 칩 자체도 각자 label을
            // 갖고 있어 시각적으로는 중복이지만, 행 전체가 Link 하나라 스크린
            // 리더가 "프로젝트명 열기"만 읽고 넘어가지 않도록 전체 문맥을
            // 앞단에서 한 번에 전달한다(NFR-017 — 배지 색만으로 의미를
            // 전달하지 않는다는 원칙과 같은 이유).
            const badgeSummary = badges.map((b) => BADGE_COPY[b]?.label ?? b).join(', ')

            return (
              <li key={p.projectId}>
                <Link
                  to={`/projects/${p.projectId}`}
                  aria-label={
                    badgeSummary ? `${p.name} 열기, ${badgeSummary}` : `${p.name} 열기, 이번 주 영향 없음`
                  }
                  className="-mx-2 flex items-center gap-3 rounded-control px-2 py-2.5 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <span className="min-w-0 flex-1 truncate text-label font-medium text-text">{p.name}</span>
                  {badges.length === 0 ? (
                    <span className="shrink-0 text-caption text-text-muted">영향 없음</span>
                  ) : (
                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                      {badges.map((b) => (
                        <Badge key={b} tone={BADGE_COPY[b]?.tone ?? 'neutral'} label={BADGE_COPY[b]?.label ?? b} />
                      ))}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {projects.length > MAX_VISIBLE && (
        <div className="mt-2 flex justify-end">
          <Link
            to="/projects"
            className="rounded text-label font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            프로젝트 전체 보기 →
          </Link>
        </div>
      )}
    </div>
  )
}

export default ImpactList
