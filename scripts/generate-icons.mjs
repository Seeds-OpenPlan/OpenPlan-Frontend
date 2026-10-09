#!/usr/bin/env node
// 확정 디자인 A 앱 아이콘 생성 스크립트.
//
// TWA(Trusted Web Activity)로 구글 플레이에 출시하려면 Bubblewrap이 매니페스트의
// 아이콘 PNG를 그대로 앱 아이콘/스플래시로 패키징한다. 아이콘 생성기에 npm
// 패키지(sharp/canvas 등)를 새로 추가하는 것은 범위 밖이라, Node 내장 zlib만
// 으로 PNG를 직접 인코딩한다.
//
// 디자인 정본은 `Github/docs/플레이 출시 작업내용/스토어 그래픽/openplan-icon.svg`
// (오너 확정, "디자인 A") — 브랜드 파랑(#2563eb) 배경 위에 흰색 고리(중심 반지름
// 148, 두께 44)와 흰색 체크(두께 40, 둥근 끝·둥근 꺾임)를 얹은 모양이다. 이
// 스크립트는 그 SVG의 512 기준 좌표를 각 출력 크기로 비례 축소해 그린다.
// 아이콘(또는 이름)을 다시 바꾸려면 위 SVG와 이 스크립트를 함께 수정한 뒤
// `public/icons/*`, `public/favicon.png`, `public/apple-touch-icon.png`를
// 다시 생성해야 하고, 플레이스토어에는 **새 AAB를 다시 업로드**해야 한다 —
// 아이콘만 바꿔서는 이미 배포된 APK/AAB가 자동으로 갱신되지 않는다.
//
// 실행: node scripts/generate-icons.mjs (저장소 루트에서)

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PUBLIC_DIR = join(ROOT, 'public')
const ICONS_DIR = join(PUBLIC_DIR, 'icons')

// 브랜드 토큰 (src/index.css --color-brand-600 / --color-neutral-0 과 동일 값).
// 이 스크립트는 CSS를 파싱하지 않고 숫자를 하드코딩한다 — 토큰 파일이
// 바뀌면 이 두 상수도 함께 맞춰야 한다(자동 동기화 없음, 플레이스홀더라서
// 굳이 빌드 타임 CSS 파싱까지 들이지 않았다).
const BRAND = [0x25, 0x63, 0xeb] // #2563eb
const WHITE = [0xff, 0xff, 0xff]

// ---------------------------------------------------------------------------
// PNG 인코딩 (RFC 2083 최소 구현: 8bit/RGBA, 압축 0, 필터 0, 비-인터레이스)
// ---------------------------------------------------------------------------

// PNG 스펙 부록(Sample CRC Code)의 표준 CRC-32 구현. zlib에 공개 crc32 API가
// 없는 Node 버전에서도 동작하도록 직접 둔다.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcInput = Buffer.concat([typeBuf, data])
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(crcInput), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

// rgba: size*size*4 길이의 Uint8Array (행 우선, straight alpha).
function encodePNG(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0) // width
  ihdr.writeUInt32BE(size, 4) // height
  ihdr.writeUInt8(8, 8) // bit depth
  ihdr.writeUInt8(6, 9) // color type 6 = RGBA
  ihdr.writeUInt8(0, 10) // compression method
  ihdr.writeUInt8(0, 11) // filter method
  ihdr.writeUInt8(0, 12) // interlace method

  // 스캔라인마다 필터 타입 바이트(0 = None)를 앞에 붙여야 한다.
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0 // filter: None
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride)
  }

  const idatData = deflateSync(raw, { level: 9 })

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------
// 벡터 마크 렌더링: 분석적 signed-distance 함수로 테두리를 그린 뒤
// coverage = clamp(0.5 - distance, 0, 1) 로 1px 폭 안티앨리어싱을 입힌다.
// (슈퍼샘플링 없이도 가장자리가 계단 현상 없이 매끈하게 나온다.)
// ---------------------------------------------------------------------------

function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

// Inigo Quilez의 rounded-box SDF. 음수면 도형 내부, 0이면 경계, 양수면 외부
// (단위는 픽셀 근사치).
function roundedRectSD(x, y, cx, cy, halfSize, radius) {
  const qx = Math.abs(x - cx) - (halfSize - radius)
  const qy = Math.abs(y - cy) - (halfSize - radius)
  const outside = Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2)
  const inside = Math.min(Math.max(qx, qy), 0)
  return outside + inside - radius
}

// 고리(annulus) SDF: 중심에서의 거리를 두 반지름 사이의 "두께"와 비교한다.
function annulusSD(x, y, cx, cy, outerRadius, innerRadius) {
  const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
  const mid = (outerRadius + innerRadius) / 2
  const halfWidth = (outerRadius - innerRadius) / 2
  return Math.abs(dist - mid) - halfWidth
}

// 캡슐(둥근 끝 선분) SDF: 점 (x,y)에서 선분 (ax,ay)-(bx,by)까지의 최단 거리에서
// 반지름(= 선 굵기의 절반)을 뺀다 — 음수면 선 안쪽, 0이면 경계. 체크마크는
// stroke-linecap/linejoin이 "round"이므로 선분 2개의 캡슐을 그대로 합치면
// (끝점이 항상 반원으로 마감되므로) 이음매도 둥글게 떨어져 SVG와 동일해진다.
function capsuleSD(x, y, ax, ay, bx, by, radius) {
  const abx = bx - ax
  const aby = by - ay
  const lengthSq = abx * abx + aby * aby
  // lengthSq가 0이면(퇴화 선분) 그냥 점으로 취급 — 이 아이콘에서는 발생하지
  // 않지만 0 나눗셈을 막기 위한 방어 코드.
  const t = lengthSq > 0 ? clamp01(((x - ax) * abx + (y - ay) * aby) / lengthSq) : 0
  const closestX = ax + t * abx
  const closestY = ay + t * aby
  const dx = x - closestX
  const dy = y - closestY
  return Math.sqrt(dx * dx + dy * dy) - radius
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

// 디자인 A의 512 기준 좌표(openplan-icon.svg 그대로). 모든 출력 크기는 이
// 좌표를 scale = size/512 로 비례 축소해서 그린다 — 512 기준 그대로도
// 512*0.5 = 256 = size/2 이므로 cx/cy 계산과도 어긋나지 않는다.
const DESIGN_SIZE = 512
const RING_CENTER_RADIUS = 148
const RING_STROKE_WIDTH = 44
const CHECK_STROKE_WIDTH = 40
// 체크마크 꺾은선의 세 점(M/L/L) — [190,262] → [238,310] → [324,218].
// 두 선분 (0,1), (1,2) 각각을 캡슐로 그린다.
const CHECK_POINTS = [
  [190, 262],
  [238, 310],
  [324, 218],
]

/**
 * size x size RGBA 버퍼를 만든다.
 * - fullBleed=true  : 아이콘 전체를 브랜드색으로 꽉 채운다(알파 항상 255).
 *                      apple-touch-icon / favicon / maskable 용 — OS가 자체
 *                      적으로 모서리를 둥글리거나 마스킹하므로 여기서 투명
 *                      모서리를 만들면 오히려 OS 마스크와 이중으로 겹쳐 보인다.
 * - fullBleed=false : 둥근 사각형 바깥은 완전 투명(알파 0) — "any" 목적
 *                      아이콘용. 플랫폼이 마스킹하지 않을 때도 사각 배경이
 *                      아니라 둥근 배지처럼 보이게 한다. PWA의 "any" 아이콘은
 *                      (adaptive icon처럼 강제 마스킹되는 환경이 아니면) 투명
 *                      모서리 배지가 관례이므로 기존 동작을 유지한다.
 * - strokeBoost     : 선 굵기에 곱하는 배율(기본 1). 파비콘(48px)처럼 아주
 *                      작은 크기에서는 그대로 축소하면 고리/체크 선이 가늘어
 *                      안티앨리어싱에 묻히므로, 아주 살짝만 굵게 보정한다.
 *
 * 고리 바깥 반지름(= (148+22)/512 = size*0.3633)은 maskable 아이콘의
 * "안전 영역"(중앙 지름 80%, 반지름 40% = size*0.4) 안에 여유 있게 들어간다.
 */
function renderMark(size, { fullBleed, strokeBoost = 1 }) {
  const rgba = Buffer.alloc(size * size * 4)
  const scale = size / DESIGN_SIZE
  const cx = size / 2
  const cy = size / 2
  const cornerRadius = size * 0.18

  const ringCenterRadius = RING_CENTER_RADIUS * scale
  const ringHalfStroke = (RING_STROKE_WIDTH * scale * strokeBoost) / 2
  const ringOuterRadius = ringCenterRadius + ringHalfStroke
  const ringInnerRadius = ringCenterRadius - ringHalfStroke

  const checkRadius = (CHECK_STROKE_WIDTH * scale * strokeBoost) / 2
  // 체크마크 좌표도 동일한 scale로 축소한다(디자인 원점이 뷰박스 (0,0)-(512,512)
  // 라서 cx/cy와 별개로 x,y를 그대로 scale만 곱하면 된다).
  const checkSegments = [
    [CHECK_POINTS[0], CHECK_POINTS[1]],
    [CHECK_POINTS[1], CHECK_POINTS[2]],
  ].map(([[ax, ay], [bx, by]]) => [ax * scale, ay * scale, bx * scale, by * scale])

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5

      const bgCoverage = fullBleed
        ? 1
        : clamp01(0.5 - roundedRectSD(px, py, cx, cy, size / 2, cornerRadius))
      const ringCoverage = clamp01(0.5 - annulusSD(px, py, cx, cy, ringOuterRadius, ringInnerRadius))

      // 두 체크 선분 중 더 가까운(= coverage가 더 큰) 쪽을 취해 합집합으로 만든다.
      let checkCoverage = 0
      for (const [ax, ay, bx, by] of checkSegments) {
        const coverage = clamp01(0.5 - capsuleSD(px, py, ax, ay, bx, by, checkRadius))
        if (coverage > checkCoverage) checkCoverage = coverage
      }

      // 고리와 체크 중 더 많이 덮는 쪽으로 흰색을 섞는다(두 마크는 겹치지
      // 않는 디자인이라 단순 max로 충분하다).
      const markCoverage = Math.max(ringCoverage, checkCoverage)

      const r = lerp(BRAND[0], WHITE[0], markCoverage)
      const g = lerp(BRAND[1], WHITE[1], markCoverage)
      const b = lerp(BRAND[2], WHITE[2], markCoverage)
      const a = Math.round(bgCoverage * 255)

      const i = (y * size + x) * 4
      rgba[i] = Math.round(r)
      rgba[i + 1] = Math.round(g)
      rgba[i + 2] = Math.round(b)
      rgba[i + 3] = a
    }
  }

  return rgba
}

function writeIcon(path, size, options) {
  const rgba = renderMark(size, options)
  const png = encodePNG(size, rgba)
  writeFileSync(path, png)
  console.log(`  wrote ${path} (${size}x${size}, ${png.length} bytes)`)
}

mkdirSync(ICONS_DIR, { recursive: true })

console.log('Generating PWA icons (design A: ring + check)...')
// manifest "any" 아이콘: 둥근 배지 + 투명 모서리.
writeIcon(join(ICONS_DIR, 'icon-192.png'), 192, { fullBleed: false })
writeIcon(join(ICONS_DIR, 'icon-512.png'), 512, { fullBleed: false })
// manifest "maskable" 아이콘: 전면 배경, 마크는 안전 영역 안.
writeIcon(join(ICONS_DIR, 'icon-maskable-512.png'), 512, { fullBleed: true })
// iOS 홈 화면 아이콘: iOS가 자체적으로 모서리를 둥글리므로 전면 배경으로.
writeIcon(join(PUBLIC_DIR, 'apple-touch-icon.png'), 180, { fullBleed: true })
// 파비콘: 48px까지 축소하면 원래 두께(고리 44 / 체크 40 @512)가 각각 4.1px /
// 3.75px로 가늘어져 안티앨리어싱에 묻히기 쉽다. strokeBoost로 선만 1.35배
// 굵게 보정해 탭바/브라우저 탭 크기에서도 고리·체크 형태가 또렷하게 보이도록
// 했다 — 위치·비율은 그대로 두고 두께만 키운다.
writeIcon(join(PUBLIC_DIR, 'favicon.png'), 48, { fullBleed: true, strokeBoost: 1.35 })

console.log('Done.')
