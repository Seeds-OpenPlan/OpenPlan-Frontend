import { Link } from 'react-router-dom'
import { Badge } from '../common/Badge'
import { ErrorState } from '../common/ErrorState'
import { formatDurationKO } from '../../features/plan/planTime'

const MAX_VISIBLE = 5

/*
  S4 · 이번 주 투입 (DASH-06 — ui-spec-dash.md §DASH.4). Each row IS the "프로젝트
  열기" affordance (no separate button in the reference design) — the whole row
  is a Link, with an aria-label carrying the numbers a sighted user reads off
  the row's text/bar (NFR-017: the mini bar itself is decorative/aria-hidden).

  `/projects/{id}` doesn't resolve yet in THIS worktree (ST-F1-08 owns the
  project detail route, in progress on its own branch) — the link is built to
  spec regardless, same seam-not-yet-live situation as `?openUnplaced=1`.
*/
export function ImpactList({ error = false, onRetry, projects = [] }) {
  if (error) {
    return (
      <section>
        <h2 className="mb-2 text-title font-semibold text-text">이번 주 투입</h2>
        <ErrorState variant="section" onAction={onRetry} />
      </section>
    )
  }

  const visible = projects.slice(0, MAX_VISIBLE)

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-title font-semibold text-text">이번 주 투입</h2>

      {visible.length === 0 ? (
        <p className="mt-3 text-label text-text-muted">이번 주에 영향 있는 프로젝트가 없습니다.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {visible.map((p) => {
            const share = Math.min(Math.max(p.sharePercent ?? 0, 0), 100)
            const meta = [
              formatDurationKO(p.investedMinutes ?? 0),
              `가용 ${p.availablePercent ?? 0}%`,
              p.unplacedCount > 0 ? `미배치 ${p.unplacedCount}` : null,
            ].filter(Boolean)

            return (
              <li key={p.projectId}>
                <Link
                  to={`/projects/${p.projectId}`}
                  aria-label={`${p.name} 열기, 이번 주 ${formatDurationKO(p.investedMinutes ?? 0)} 투입, 가용 대비 ${p.sharePercent ?? 0}%`}
                  className="-mx-2 flex items-center gap-4 rounded-control px-2 py-2.5 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-label font-medium text-text line-clamp-1">{p.name}</span>
                      {p.adjustCount > 0 && <Badge tone="danger" label={`조정 ${p.adjustCount}`} />}
                    </div>
                    <p className="mt-0.5 text-caption text-text-muted tabular-nums">{meta.join(' · ')}</p>
                    <div
                      aria-hidden="true"
                      className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200"
                    >
                      <div className="h-full rounded-full bg-neutral-800" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                  <span className="shrink-0 text-title font-semibold text-text tabular-nums">
                    {p.sharePercent ?? 0}%
                  </span>
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
