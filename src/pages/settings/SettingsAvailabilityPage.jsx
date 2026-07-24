import { useEffect, useMemo, useState } from 'react'
import { useAvailability, useSaveAvailability } from '../../features/plan/usePlanData'
import { WEEKDAY_KEYS, WEEKDAY_LABELS_KO, formatDurationKO, snapMinutes } from '../../features/plan/planTime'
import { commonPattern as sharedCommonPattern, rangeSumMinutes } from '../../features/settings/availabilityHelpers'
import { useWeeklyAvailableMinutes, useUpdateWeeklyAvailableMinutes } from '../../features/settings/useSettings'
import { Toggle } from '../../components/common/Toggle'
import { Button } from '../../components/common/Button'
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton'
import { ErrorState } from '../../components/common/ErrorState'
import { useAppStore } from '../../store/useAppStore'

/*
  SettingsAvailabilityPage — FIX-01~03 (§ST-F1-12 AC-1). Reads/writes the SAME
  `GET/PUT /users/me/availabilities` contract the weekly-plan grid already
  uses (usePlanData's useAvailability/useSaveAvailability, ST-F1-02) — this
  screen adds no new endpoint, only a second UI over the existing one.

  Two-tier edit model, matching the reference (Desktop.Settings.AvailableTime.png):
  - "가용 시간 범위 (기본 패턴)" (공통 행): one start/end pair. Changing it
    bulk-applies to ALL 7 days at once — the fast path for "내 평일이 다 똑같다".
  - "요일별 가용 시간 범위 조정" (accordion): each day can be expanded to
    override JUST that day's own start/end, and toggled active/inactive
    independently. A day that has never been overridden simply carries the
    same value the common row last applied — there is no separate "is this
    overridden" flag; the common pattern IS just the majority value
    (availabilityHelpers.commonPattern).

  용어 정렬(오너 리뷰 2차 추가건, 99번 용어집 기준 — 이 화면 한정, 주간계획/
  프로젝트/대시보드는 별도 후속 브랜치): "가용 시간 범위"(요일/공통 패턴의 실제
  계획 가능 시간대)와 "가용 시간 범위 합계"(그 결과 계산되는 참고용 총량)는
  용어집이 구분하는 서로 다른 개념이라 화면에서도 별도 라벨·별도 줄로 분리해
  보여준다. "집중"류 표현(집중 범위 등)은 용어집에 없는 개념이라 이 화면에서
  전부 뺐다.

  오너 결정 2026-07-25(phase 1) — "가용 시간" 자체는 세 번째 개념: 위 범위 합
  (계산값)과는 무관하게 사용자가 "이번 주에 실제로 할애할 수 있는 시간"을
  직접 입력하는 값이다(예: 범위 합은 45시간이어도 실제 가용 시간은 30시간).
  화면 맨 위 WeeklyAvailableTimeCard가 그 독립 입력이고, [가정-확장] 저장소
  (useSettings.useWeeklyAvailableMinutes)를 쓴다 — 이 파일이 다루는 가용 시간
  범위(patterns)의 REAL 계약과는 완전히 별개다. 주간계획/대시보드/V4가 이
  값을 읽게 하는 건 이 스토리 범위 밖(오너가 후속으로 뺌).

  Draft lives in local state (TanStack Query owns the SERVER copy only, per
  design-handoff §3) and is seeded ONCE when the query first resolves — a
  later background refetch must never silently overwrite an in-progress edit.
*/

function minutesToTimeInput(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function timeInputToMinutes(value) {
  const [h, m] = value.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

const TIME_FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'

// The common-row value shown/edited: availabilityHelpers.commonPattern's
// majority-vote result (shared with the hub's own badge — see that file's
// header for why this must not be a second, possibly-diverging copy), with a
// fixed 09:00-18:00 fallback only for the one case that helper deliberately
// returns null for: every day off, where there is no "majority" of an empty
// set but the field must still show SOMETHING editable.
function deriveCommonPattern(patterns) {
  return sharedCommonPattern(patterns) ?? { startMinutes: 9 * 60, endMinutes: 18 * 60 }
}

function DayRow({ pattern, expanded, onToggleExpand, onToggleActive, onChangeTimes }) {
  const label = WEEKDAY_LABELS_KO[WEEKDAY_KEYS.indexOf(pattern.weekday)]
  const invalid = pattern.startMinutes >= pattern.endMinutes

  return (
    <div className="border-b border-border last:border-b-0">
      {/* 오너 리뷰 3차 item 2 — 요일 라벨이 왼쪽 테두리에 너무 붙어 보인다는
          지적. 이 행만 px-3이던 것을 목록의 다른 모든 행(예: SettingsNavList의
          Row)과 같은 px-4로 맞추고, 라벨 자체 폭도 한 칸 더 줘서 시간 텍스트와의
          간격까지 함께 여유 있게 만들었다. */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-3 rounded-control text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <span className="w-8 text-label font-medium text-text">{label}</span>
          <span className="text-label text-text-muted">
            {minutesToTimeInput(pattern.startMinutes)} - {minutesToTimeInput(pattern.endMinutes)}
          </span>
        </button>
        <Toggle
          checked={pattern.isActive}
          onChange={onToggleActive}
          size="sm"
          ariaLabel={`${label}요일 가용`}
        />
      </div>
      {expanded && (
        <div className="flex flex-col gap-2 border-t border-border bg-surface-sunken px-4 py-3">
          <p className="text-caption text-text-muted">{label}요일만 개별 설정합니다</p>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-caption font-medium text-text-muted">시작</span>
              <input
                type="time"
                step="300"
                value={minutesToTimeInput(pattern.startMinutes)}
                onChange={(e) => {
                  const m = timeInputToMinutes(e.target.value)
                  if (m != null) onChangeTimes({ startMinutes: snapMinutes(m) })
                }}
                className={TIME_FIELD}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-caption font-medium text-text-muted">종료</span>
              <input
                type="time"
                step="300"
                value={minutesToTimeInput(pattern.endMinutes)}
                onChange={(e) => {
                  const m = timeInputToMinutes(e.target.value)
                  if (m != null) onChangeTimes({ endMinutes: snapMinutes(m) })
                }}
                className={TIME_FIELD}
              />
            </label>
          </div>
          {invalid && (
            <p role="alert" className="text-caption text-danger-700">
              종료 시간이 시작 시간보다 늦어야 합니다
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// "가용 시간" (phase 1, 사용자 입력) — 순수 표시용 컴포넌트: 쿼리/뮤테이션
// 훅은 전부 부모(SettingsAvailabilityPage)가 갖고 있다. 이 화면에 이미 있는
// 다른 draft(요일별 patterns)와 dirty 신호를 하나의 effect로 합치기 위해서다
// — 이 카드가 자기 훅을 따로 가지면 그 dirty effect가 두 개로 나뉘어 서로
// 다른 렌더 타이밍에 markDirty/markClean을 부를 수 있고, 그러면 "범위는
// 수정 중인데 가용 시간 저장 직후라 dirty가 꺼진다" 같은 경합이 생긴다.
function WeeklyAvailableTimeCard({ hours, onChangeHours, onSave, saving, dirty, loading, error, onRetry }) {
  if (loading) return <LoadingSkeleton preset="text" />
  if (error) return <ErrorState variant="inline" onAction={onRetry} />

  return (
    <section className="rounded-card border-2 border-brand-200 bg-brand-50 p-4">
      <p className="mb-1 text-label font-semibold text-brand-700">가용 시간</p>
      <p className="mb-3 text-caption text-text-muted">
        이번 주에 계획에 실제로 할애할 수 있는 시간입니다. 가용 시간 범위·고정 일정과는 무관하게 직접 정합니다.
      </p>
      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-caption font-medium text-text-muted">주간 가용 시간</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.5"
              value={hours}
              onChange={(e) => onChangeHours(Number(e.target.value))}
              className="w-24 rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
            />
            <span className="text-label text-text-muted">시간</span>
          </div>
        </label>
        <Button variant="primary" size="md" onClick={onSave} loading={saving} disabled={!dirty || hours < 0}>
          저장
        </Button>
      </div>
    </section>
  )
}

// 30분 단위로 스냅 — 가용 시간(사용자 입력)은 5분 단위 블록 배치와 달리 대략적인
// 주간 목표치라, 30분이 입력 부담과 정밀도 사이 더 적절한 스텝이라고 판단했다
// (오너 지시 "가정 판단해서"). snapMinutes(m,5)와 같은 모양의 헬퍼를 30 스텝으로.
function snapToHalfHour(minutes) {
  return Math.max(0, Math.round(minutes / 30) * 30)
}

function SettingsAvailabilityPage() {
  const query = useAvailability()
  const saveAvailability = useSaveAvailability()
  const capacityQuery = useWeeklyAvailableMinutes()
  const updateCapacity = useUpdateWeeklyAvailableMinutes()
  const markDirty = useAppStore((s) => s.markDirty)
  const markClean = useAppStore((s) => s.markClean)

  const [draft, setDraft] = useState(null) // 7 patterns, seeded once below
  const [expandedDay, setExpandedDay] = useState(null)
  const [commonApplyInvalid, setCommonApplyInvalid] = useState(false) // 공통 행의 마지막 시도가 거부됐는지(아래 참고)
  const [capacityHours, setCapacityHours] = useState(null) // 가용 시간(phase 1), seeded once below

  // Seed the draft the moment the query first resolves — done DURING render
  // (not inside a useEffect) per the "adjust state during render, don't
  // setState-in-effect" pattern: the `draft === null` guard makes this
  // self-limiting (it can only ever fire once, ever), so there is no
  // cascading-render risk an effect's own extra render/commit cycle would add.
  if (query.data && draft === null) {
    setDraft(query.data)
  }
  if (capacityQuery.data != null && capacityHours === null) {
    setCapacityHours(capacityQuery.data / 60)
  }

  // Thomas 리뷰 MAJOR fix — commonStart/commonEnd를 별도 state로 얼려 두지
  // 않고 draft에서 매번 다수결로 파생한다(useMemo). 예전엔 seed 시 딱 한 번만
  // 계산해 고정했는데, 그 뒤 요일별 개별 편집이 있어도 이 state는 갱신되지
  // 않아 — 재현: 전체 09-18 → 월~목만 10-19로 개별 수정 → 공통 종료만
  // 18:00→18:30로 바꾸면 stale한 commonStart(09:00)로 applyCommonPattern이
  // 호출돼 7일 전체가 09:00-18:30로 덮이면서 방금 한 월~목 커스텀 편집이
  // 유실됐다. 파생값이므로 draft가 바뀔 때마다(요일 편집이든 공통 적용
  // 자체든) 자동으로 다시 계산되어 항상 "지금" 다수결을 반영한다 — 표시와
  // 적용(아래 onChange) 양쪽이 같은 값을 본다.
  const { startMinutes: commonStart, endMinutes: commonEnd } = useMemo(
    () => deriveCommonPattern(draft),
    [draft],
  )

  const rangeDirty = draft !== null && query.data != null && JSON.stringify(draft) !== JSON.stringify(query.data)
  const capacityDirty =
    capacityHours !== null &&
    capacityQuery.data != null &&
    snapToHalfHour(capacityHours * 60) !== capacityQuery.data
  // 두 draft(요일별 범위 · 가용 시간)를 하나의 dirty 신호로 합친다 — 이유는
  // WeeklyAvailableTimeCard 주석 참고(별도 effect가 서로의 markClean을
  // 덮어쓰는 경합을 막는다).
  const isDirty = rangeDirty || capacityDirty

  useEffect(() => {
    if (isDirty) markDirty()
    else markClean()
  }, [isDirty, markDirty, markClean])
  useEffect(() => () => markClean(), [markClean])

  if (query.isLoading || draft === null) {
    return <LoadingSkeleton preset="card" />
  }
  if (query.isError) {
    return <ErrorState variant="section" onAction={() => query.refetch()} />
  }

  // anyDayInvalid만으로 충분하다 — commonStart/commonEnd는 이제 draft에서
  // 파생되고, applyCommonPattern은 valid한 쌍만 draft에 반영하므로(아래
  // onChange), 파생된 두 값이 그 자체로 invalid한 상태로 draft에 실제
  // 반영되는 경우는 없다. 요일별 개별 편집으로 생긴 invalid는 여기 그대로
  // 걸린다.
  const anyDayInvalid = draft.some((p) => p.startMinutes >= p.endMinutes)
  const rangeSumMin = rangeSumMinutes(draft)

  // 공통 행 적용 — ALL 7 days take the new range (활성 여부는 각자 그대로 유지).
  const applyCommonPattern = (nextStart, nextEnd) => {
    setDraft((prev) => prev.map((p) => ({ ...p, startMinutes: nextStart, endMinutes: nextEnd })))
  }

  const updateDay = (weekday, patch) => {
    setDraft((prev) => prev.map((p) => (p.weekday === weekday ? { ...p, ...patch } : p)))
  }

  // markClean()을 여기서 직접 부르지 않는다 — isDirty는 range/capacity 두
  // draft를 합친 값이라, 한쪽만 저장 성공했다고 여기서 바로 clean 처리하면
  // 다른 쪽의 미저장 편집을 감추게 된다(WeeklyAvailableTimeCard 주석 참고).
  // onMutate가 이미 query 캐시를 draft로 낙관 반영하므로, 다음 렌더에서
  // rangeDirty가 자연히 false가 되고 위 effect가 그때 markClean을 부른다.
  const handleSave = () => {
    if (anyDayInvalid || saveAvailability.isPending) return
    saveAvailability.mutate(draft)
  }

  const handleSaveCapacity = () => {
    if (capacityHours == null || capacityHours < 0 || updateCapacity.isPending) return
    updateCapacity.mutate(snapToHalfHour(capacityHours * 60))
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 id="settings-detail-title" className="text-title font-semibold text-text">
        가용시간
      </h2>

      {/* 가용 시간(phase 1, 사용자 입력) — 아래 "가용 시간 범위"와는 다른 값임을
          시각적으로 분명히 하려고 강조 테두리(border-2 + brand 배경)를 준
          별도 카드로, 맨 위에 배치했다(오너 지시 "상단쯤에 눈에 띄게"). */}
      <WeeklyAvailableTimeCard
        hours={capacityHours ?? 0}
        onChangeHours={setCapacityHours}
        onSave={handleSaveCapacity}
        saving={updateCapacity.isPending}
        dirty={capacityDirty}
        loading={capacityQuery.isLoading || capacityHours === null}
        error={capacityQuery.isError}
        onRetry={() => capacityQuery.refetch()}
      />

      <section className="rounded-card border border-border p-4">
        <p className="mb-3 text-caption font-medium text-text-muted">가용 시간 범위 (기본 패턴)</p>
        <div className="flex items-end gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-caption font-medium text-text-muted">시작</span>
            <input
              type="time"
              step="300"
              value={minutesToTimeInput(commonStart)}
              onChange={(e) => {
                const m = timeInputToMinutes(e.target.value)
                if (m == null) return
                const snapped = snapMinutes(m)
                if (snapped < commonEnd) {
                  setCommonApplyInvalid(false)
                  applyCommonPattern(snapped, commonEnd)
                } else {
                  // 거부 — draft를 건드리지 않는다(그러면 그 즉시
                  // deriveCommonPattern이 다시 이전 값으로 되돌린다). 대신
                  // 아래 배너로만 알린다.
                  setCommonApplyInvalid(true)
                }
              }}
              className={TIME_FIELD}
            />
          </label>
          <span className="pb-2 text-text-muted">-</span>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-caption font-medium text-text-muted">종료</span>
            <input
              type="time"
              step="300"
              value={minutesToTimeInput(commonEnd)}
              onChange={(e) => {
                const m = timeInputToMinutes(e.target.value)
                if (m == null) return
                const snapped = snapMinutes(m)
                if (commonStart < snapped) {
                  setCommonApplyInvalid(false)
                  applyCommonPattern(commonStart, snapped)
                } else {
                  setCommonApplyInvalid(true)
                }
              }}
              className={TIME_FIELD}
            />
          </label>
        </div>
        {commonApplyInvalid && (
          <p role="alert" className="mt-2 text-caption text-danger-700">
            종료 시간이 시작 시간보다 늦어야 합니다 — 요일별 값은 변경되지 않았습니다
          </p>
        )}
        {/* 용어집 구분 + 오너 결정 2026-07-25 정정 — "가용 시간 범위"(요일/공통
            패턴의 실제 시간대)와 이 아래의 합산값은 서로 다른 개념이라 별도
            행으로 시각 분리한다. 이 합산값의 이름은 더 이상 "가용 시간"도
            "주간 가용 시간 합계"도 아니다 — "가용 시간 범위 합계"라는
            참고용(계산) 수치일 뿐이고, 사용자가 직접 정하는 진짜 "가용
            시간"은 위 WeeklyAvailableTimeCard의 독립 입력이다. "집중" 표현은
            용어집에 없는 개념이라 이 화면에서 쓰지 않는다. */}
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-label text-text">
            <span className="text-text-muted">가용 시간 범위</span>{' '}
            {minutesToTimeInput(commonStart)} - {minutesToTimeInput(commonEnd)}
          </p>
          <p className="text-label text-text">
            <span className="text-text-muted">가용 시간 범위 합계 (참고용)</span>{' '}
            {formatDurationKO(rangeSumMin)}
          </p>
        </div>
      </section>

      <section>
        <p className="mb-2 text-caption font-medium text-text-muted">요일별 가용 시간 범위 조정</p>
        <div className="overflow-hidden rounded-card border border-border">
          {draft.map((pattern) => (
            <DayRow
              key={pattern.weekday}
              pattern={pattern}
              expanded={expandedDay === pattern.weekday}
              onToggleExpand={() =>
                setExpandedDay((cur) => (cur === pattern.weekday ? null : pattern.weekday))
              }
              onToggleActive={(next) => updateDay(pattern.weekday, { isActive: next })}
              onChangeTimes={(patch) => updateDay(pattern.weekday, patch)}
            />
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          loading={saveAvailability.isPending}
          disabled={anyDayInvalid}
        >
          저장
        </Button>
      </div>
    </div>
  )
}

export default SettingsAvailabilityPage
