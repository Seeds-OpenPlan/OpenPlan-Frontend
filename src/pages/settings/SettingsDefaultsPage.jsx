import { useEffect, useState } from 'react'
import { Button } from '../../components/common/Button'
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton'
import { ErrorState } from '../../components/common/ErrorState'
import { replanStrategyCatalog, BASELINE_STRATEGY_TYPE } from '../../features/plan/replanStrategies'
import { usePreferences, useUpdatePreferences, useSuggestion } from '../../features/settings/useSettings'
import { useAppStore } from '../../store/useAppStore'

// Fixed display order — same list ReplanOptionsModal shows (기준선 먼저, 나머지
// 3안은 replanStrategies.js의 GENERATED_STRATEGY_TYPES 순서 그대로), so the
// radio order never disagrees with the modal's own card order.
const STRATEGY_ORDER = [
  BASELINE_STRATEGY_TYPE,
  'MINIMAL_CHANGE',
  'DEADLINE_FIRST',
  'WORKLOAD_BALANCE',
]

/*
  SettingsDefaultsPage — 기본값 (FIX-10~12 · RB-FIX-01, §ST-F1-12 AC-3). Picks
  WHICH of the 4 재계획 대안 the replan modal (ST-F1-07) pre-selects when it
  opens. Names/blurbs come from replanStrategies.js's own catalog — the single
  place those 4 명칭 are allowed to be spelled out (J1-style rule), so this
  screen can never drift from what ReplanOptionsModal itself shows.

  [가정-확장]: `preferences`/`suggestions` have no real endpoint yet (see
  settingsApi.js's own header) — this screen is otherwise a real, working
  loop over that mock.
*/
function SettingsDefaultsPage() {
  const preferencesQuery = usePreferences()
  const suggestionQuery = useSuggestion()
  const updatePreferences = useUpdatePreferences()
  const markDirty = useAppStore((s) => s.markDirty)
  const markClean = useAppStore((s) => s.markClean)

  const [selected, setSelected] = useState(null)

  // Seed during render, not in an effect — see SettingsAvailabilityPage's own
  // comment on this exact pattern (`selected === null` makes it self-limiting).
  if (preferencesQuery.data && selected === null) {
    setSelected(preferencesQuery.data.defaultReplanStrategy)
  }

  const isDirty =
    selected !== null &&
    preferencesQuery.data != null &&
    selected !== preferencesQuery.data.defaultReplanStrategy

  useEffect(() => {
    if (isDirty) markDirty()
    else markClean()
  }, [isDirty, markDirty, markClean])
  useEffect(() => () => markClean(), [markClean])

  if (preferencesQuery.isLoading || selected === null) {
    return <LoadingSkeleton preset="card" />
  }
  if (preferencesQuery.isError) {
    return <ErrorState variant="section" onAction={() => preferencesQuery.refetch()} />
  }

  const suggestion = suggestionQuery.data
  // C-2: 선택 전에는 어떤 값도 자동 적용하지 않는다 — 이미 그 값이 선택돼 있으면
  // "적용" 칩 자체가 할 일이 없으므로 숨긴다(제안이 곧 현재 선택과 같은 경우).
  const showSuggestionChip = suggestion && suggestion.suggestedStrategy !== selected

  const handleSave = () => {
    if (!isDirty || updatePreferences.isPending) return
    updatePreferences.mutate(
      { defaultReplanStrategy: selected },
      { onSuccess: () => markClean() },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 id="settings-detail-title" className="text-title font-semibold text-text">
        기본값
      </h2>
      <p className="text-label text-text-muted">
        재계획 대안을 생성할 때 처음 선택되어 있을 안을 정합니다. 언제든 다른 안으로 바꿔 볼 수 있습니다.
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">기본 재계획 전략</legend>
        {STRATEGY_ORDER.map((type) => {
          const info = replanStrategyCatalog[type]
          return (
            <label
              key={type}
              className="flex cursor-pointer items-start gap-3 rounded-card border border-border p-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
            >
              <input
                type="radio"
                name="default-replan-strategy"
                value={type}
                checked={selected === type}
                onChange={() => setSelected(type)}
                className="mt-1"
              />
              <span className="flex flex-col">
                <span className="text-label font-medium text-text">{info.label}</span>
                <span className="text-caption text-text-muted">{info.blurb}</span>
              </span>
            </label>
          )
        })}
      </fieldset>

      {/* RB-FIX-01 제안 칩 — 클릭해야만 선택에 반영(C-2), 화면 진입만으로는 절대
          자동 적용되지 않는다(이 칩이 안 보여도 selected는 preferences 원본 그대로). */}
      {showSuggestionChip && (
        <div className="flex items-center justify-between gap-3 rounded-card border border-brand-100 bg-brand-50 px-3 py-2">
          <p className="text-caption text-brand-700">
            최근 재계획에서 {replanStrategyCatalog[suggestion.suggestedStrategy]?.label ?? suggestion.suggestedStrategy}
            을(를) {suggestion.sampleSize}회 선택했습니다
          </p>
          <Button variant="secondary" size="sm" onClick={() => setSelected(suggestion.suggestedStrategy)}>
            적용하려면 선택
          </Button>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          loading={updatePreferences.isPending}
          disabled={!isDirty}
        >
          저장
        </Button>
      </div>
    </div>
  )
}

export default SettingsDefaultsPage
