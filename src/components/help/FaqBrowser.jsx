import { useEffect, useState } from 'react'
import { PlayCircleIcon } from './helpIcons'
import { Button } from '../common/Button'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { ErrorState } from '../common/ErrorState'
import { EmptyState } from '../common/EmptyState'
import { useFaqArticles } from '../../features/help/useHelp'
import { useTutorialRestart } from '../../features/onboarding/useTutorialRestart'

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'

/*
  FAQ 검색+목록 (SCR-FAQ 콘텐츠, HELP-05/06). Originally FaqPage.jsx's own
  body; extracted so `/settings/support`(owner feedback #D)의 "자주 묻는 질문"
  탭과 예전 최상위 `/faq` 둘 다 같은 마크업을 그릴 수 있다 — 지금은
  SettingsSupportPage 하나만 이 컴포넌트를 렌더한다(최상위 `/faq`는 그리로
  리다이렉트, router.js 참고).

  Two ACs beyond a plain list+search:
  - AC-3 (전반): 검색 0건 → EmptyState의 [문의 작성] 액션. owner feedback 3차
    #2로 이 액션은 더 이상 `/help/new`로 navigate하지 않는다 — 호출자
    (SettingsSupportPage)가 넘겨주는 `onCreateNew`로 TicketCreateForm 모달을
    연다("찾는 답이 없으면 물어보세요"를 별도 안내문 없이 버튼 하나로 잇는다는
    의도는 그대로).
  - AC-3 (TUT-09 연계, SC-12): 상단에 튜토리얼 재실행 배너 — 다이얼로그/재시작
    로직 자체는 useTutorialRestart 하나를 그대로 공유한다(중복 구현 금지).

  Search has a light 250ms debounce (같은 자릿수 dry-run 디바운스들과 동일한
  이유 — 매 키 입력마다 쿼리 키를 바꿔 재요청하는 낭비를 피한다) purely
  client-side against the mock's own substring match; a real search backend
  would read `debouncedQuery` exactly the same way.
*/
export function FaqBrowser({ onCreateNew }) {
  const [input, setInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const { requestRestart, dialog: tutorialDialog } = useTutorialRestart()

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(input.trim()), 250)
    return () => clearTimeout(t)
  }, [input])

  const query = useFaqArticles(debouncedQuery)

  return (
    <div className="flex flex-col gap-6">
      {/* TUT-09 재실행 보조 진입 (SC-12) — Banner atom은 action 슬롯이 없어
          (dismiss 버튼뿐) 이 화면만의 요구(안내 문구 + 실행 버튼)에는 그
          info 톤 색 클래스만 그대로 가져와 직접 구성한다. */}
      <div
        role="status"
        className="flex flex-wrap items-center gap-3 rounded-card border border-brand-100 bg-brand-50 px-4 py-3 text-label text-brand-700"
      >
        <PlayCircleIcon className="h-5 w-5 shrink-0" />
        <span className="flex-1">튜토리얼을 다시 보고 싶으신가요? 핵심 조작을 처음부터 다시 안내받을 수 있습니다.</span>
        <Button variant="outline" size="sm" onClick={requestRestart}>
          튜토리얼 다시 실행
        </Button>
      </div>
      {tutorialDialog}

      <label className="flex flex-col gap-1">
        <span className="sr-only">FAQ 검색</span>
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="궁금한 내용을 검색해 보세요"
          className={FIELD}
        />
      </label>

      {query.isError ? (
        <ErrorState variant="section" title="FAQ를 불러오지 못했습니다" onAction={() => query.refetch()} />
      ) : query.isLoading ? (
        <LoadingSkeleton preset="listRow" count={4} />
      ) : (query.data ?? []).length === 0 ? (
        // AC-3 — 검색 0건은 오류가 아니라 "문의로 이어지는" 안내.
        <EmptyState
          title={debouncedQuery ? '검색 결과가 없습니다' : 'FAQ가 아직 없습니다'}
          description={debouncedQuery ? `"${debouncedQuery}"에 해당하는 FAQ를 찾지 못했습니다` : undefined}
          actionLabel="문의 작성"
          onAction={onCreateNew}
        />
      ) : (
        <FaqList articles={query.data} />
      )}
    </div>
  )
}

// 카테고리별로 묶어 표시 — 원본 배열의 순서를 그대로 유지하면서(서버가 이미
// 우선순위대로 정렬해 준다는 전제) 첫 등장 순서로 카테고리 섹션을 만든다.
function FaqList({ articles }) {
  const sections = []
  const indexByCategory = new Map()
  for (const article of articles) {
    if (!indexByCategory.has(article.category)) {
      indexByCategory.set(article.category, sections.length)
      sections.push({ category: article.category, items: [] })
    }
    sections[indexByCategory.get(article.category)].items.push(article)
  }

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <div key={section.category} className="flex flex-col gap-2">
          <h3 className="px-1 text-caption font-medium text-text-muted">{section.category}</h3>
          <ul className="overflow-hidden rounded-card border border-border bg-surface">
            {section.items.map((article) => (
              <li key={article.faqId} className="border-b border-border px-4 py-3 last:border-b-0">
                <p className="text-label font-semibold text-text">{article.question}</p>
                <p className="mt-1 text-label text-text-muted">{article.answer}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default FaqBrowser
