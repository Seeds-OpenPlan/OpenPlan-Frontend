import { useId } from 'react'

/*
  TimeSelect — 시/분 두 개의 <select>를 하나의 필드처럼 묶어 보여주는 24시간제
  시간 입력. 네이티브 <input type="time">이 브라우저/OS 로케일에 따라 제멋대로
  "오전/오후" 표기와 시계 아이콘을 그려, 같은 화면의 다른 텍스트("09:00 - 18:00"
  같은 24시간제 숫자 표시)와 어긋나 보인다는 지적(오너 피드백, W6 — 가용 시간
  설정 화면)에 따라 대체용으로 만들었다. 필드 폭도 내용에 맞춰 좁아져, 같이
  지적된 "불필요하게 넓고 휑한 입력칸" 문제도 함께 해소한다.

  분 옵션을 5분 단위로만 제공해 `snapMinutes`가 강제하는 5분 그리드 규칙을
  컨트롤 자체가 드러낸다 — 예전엔 아무 값이나 입력한 뒤 조용히 반올림돼
  ("스냅백") 왜 값이 바뀌었는지 사용자가 알 수 없었다.

  값/이벤트 계약은 순수 분 단위 정수(0~1435)로, 호출자가 하던 "HH:MM" 문자열
  파싱을 이 컴포넌트 밖으로 걷어냈을 뿐 — snapMinutes를 어디서 적용할지 등
  나머지 로직/상태 흐름은 호출자(SettingsAvailabilityPage)에 그대로 남아 있다.
  시/분 어느 select를 바꾸든 결과값은 항상 5의 배수다(시를 바꾸면 기존 분은
  그대로 더해지고, 분을 바꿔도 옵션 자체가 5의 배수뿐이라).
*/

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5) // 00, 05, …, 55

// 드롭다운 어포던스용 아래방향 화살표. 기존 아이콘 인벤토리(settingsIcons.jsx,
// planIcons.jsx 등)엔 좌/우 화살표뿐이라, 같은 컨벤션(1em 크기, currentColor,
// aria-hidden)으로 이 파일에만 로컬로 하나 둔다 — select 자체가 이미 의미를
// 전달하므로(NFR-017) 장식 아이콘일 뿐이다.
function ChevronDownIcon(props) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

// 시/분 각각의 select 하나. 두 자리 숫자만 보여준다(표시 컨벤션을 화면 다른
// 곳의 "09:00" 표기와 맞추기 위해 "09시"처럼 단위를 덧붙이지 않는다) — 대신
// 스크린리더용 접근 가능한 이름은 `label`이 "시작 시"/"시작 분"처럼 단위를
// 포함해 값만으로는 모호한 정보를 보완한다.
function TimeUnitSelect({ id, label, value, options, onChange, disabled }) {
  return (
    <span className="relative inline-flex items-center">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        // appearance-none으로 브라우저마다 제각각인 기본 select 박스(테두리·
        // 배경)를 지우고, 오른쪽 여백에 위 화살표 아이콘을 겹쳐 하나의 토큰
        // 기반 필드처럼 보이게 한다. 포커스 링은 이 select가 아니라 부모
        // 래퍼(TimeSelect)가 focus-within으로 한 번만 그린다 — 시/분 select를
        // 오갈 때 링이 두 번 깜빡이지 않도록.
        className="w-9 appearance-none rounded-sm bg-transparent py-1.5 pl-1 pr-4 text-center text-label text-text focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {String(opt).padStart(2, '0')}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-0.5 text-text-muted" />
    </span>
  )
}

/**
 * @param value    minutes-of-day (0~1435, 5의 배수여야 함 — 호출자가 시드)
 * @param onChange (nextMinutes) => void — 항상 5의 배수(분 select가 5분
 *                 단위 옵션만 제공하므로). 호출자가 기존처럼 snapMinutes를
 *                 한 번 더 씌워도 안전하다(이미 5의 배수라 항등 연산).
 * @param label    이 필드가 무엇인지 나타내는 한국어 이름 — 시/분 각 select의
 *                 스크린리더 이름을 "{label} 시"/"{label} 분"으로 만든다.
 *                 같은 화면에 여러 행이 있으면 "월요일 시작"처럼 행을 구분할
 *                 수 있는 문구를 넘긴다(다른 폼 필드 라벨과 동일한 관례).
 */
export function TimeSelect({ value, onChange, label, disabled = false }) {
  const hourId = useId()
  const minuteId = useId()
  const hour = Math.floor(value / 60)
  const minute = value % 60

  return (
    <span className="inline-flex items-center gap-0.5 rounded-control border border-border bg-surface px-1 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus-ring">
      <TimeUnitSelect
        id={hourId}
        label={`${label} 시`}
        value={hour}
        options={HOURS}
        onChange={(h) => onChange(h * 60 + minute)}
        disabled={disabled}
      />
      <span className="text-text-muted" aria-hidden="true">
        :
      </span>
      <TimeUnitSelect
        id={minuteId}
        label={`${label} 분`}
        value={minute}
        options={MINUTES}
        onChange={(m) => onChange(hour * 60 + m)}
        disabled={disabled}
      />
    </span>
  )
}

export default TimeSelect
