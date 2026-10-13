#!/usr/bin/env node
// 확정 디자인 = 고리만 (오너 2026-10-13).
//
// TWA(Trusted Web Activity)로 구글 플레이에 출시하려면 Bubblewrap이 매니페스트의
// 아이콘 PNG를 그대로 앱 아이콘/스플래시로 패키징한다. 아이콘 생성기에 npm
// 패키지(sharp/canvas 등)를 새로 추가하는 것은 범위 밖이라, Node 내장 zlib만
// 으로 PNG를 직접 인코딩한다.
//
// 디자인 정본은 `Github/docs/플레이 출시 작업내용/스토어 그래픽/openplan-icon.svg`
// (오너 확정 2026-10-13) — 브랜드 파랑(#2563eb) 배경 위에 흰색 고리 하나만
// 얹은 모양이다. 체크마크가 있던 이전 "디자인 A"는 오너 피드백(① #65가 임시로
// 띄워 뒀던 고리 전용 모양이 더 예뻤다 ② 고리+체크는 중앙 정렬이 안 맞아
// 보인다)에 따라 폐기됐다 — 고리 비율도 그 #65 플레이스홀더 값(바깥 반지름
// size*0.33, 안쪽 반지름 size*0.18)을 그대로 되살린 것이다.
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

function lerp(a, b, t) {
  return a + (b - a) * t
}

// 고리 비율 — #65가 임시로 띄워 뒀던 플레이스홀더 값을 그대로 정본으로
// 승격한 것(오너: "이게 더 예쁘다"). size에 대한 비율이라 모든 출력 크기가
// 자동으로 같은 모양을 유지한다(512 기준 좌표를 스케일링하는 방식이 아님).
const RING_OUTER_RATIO = 0.33
const RING_INNER_RATIO = 0.18

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
 *
 * 고리는 캔버스 정중앙(cx,cy = size/2)에 둔다 — 체크마크가 있던 이전 디자인은
 * 체크 꺾은선이 고리 중심에서 살짝 치우쳐 있어 "중앙이 안 맞는다"는 오너
 * 피드백을 받았는데, 고리 단독이면 원 자체가 대칭이라 그 문제가 없다.
 *
 * 고리 바깥 반지름(size*0.33)은 maskable 아이콘의 "안전 영역"(중앙 지름 80%,
 * 반지름 40% = size*0.4) 안에 여유 있게 들어간다. 48px 파비콘에서도 고리
 * 두께(outer-inner = size*0.15, 48px 기준 7.2px)가 충분히 두꺼워 안티앨리어싱에
 * 묻히지 않으므로, 이전 디자인(체크 포함, 두께 비율 더 얇음)에 있던 작은
 * 크기용 strokeBoost 보정은 더 필요 없다 — 그대로 비율만 축소한다.
 */
function renderMark(size, { fullBleed }) {
  const rgba = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const cornerRadius = size * 0.18
  const ringOuterRadius = size * RING_OUTER_RATIO
  const ringInnerRadius = size * RING_INNER_RATIO

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5

      const bgCoverage = fullBleed
        ? 1
        : clamp01(0.5 - roundedRectSD(px, py, cx, cy, size / 2, cornerRadius))
      const ringCoverage = clamp01(0.5 - annulusSD(px, py, cx, cy, ringOuterRadius, ringInnerRadius))

      const r = lerp(BRAND[0], WHITE[0], ringCoverage)
      const g = lerp(BRAND[1], WHITE[1], ringCoverage)
      const b = lerp(BRAND[2], WHITE[2], ringCoverage)
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

console.log('Generating PWA icons (design: ring only)...')
// manifest "any" 아이콘: 둥근 배지 + 투명 모서리.
writeIcon(join(ICONS_DIR, 'icon-192.png'), 192, { fullBleed: false })
writeIcon(join(ICONS_DIR, 'icon-512.png'), 512, { fullBleed: false })
// manifest "maskable" 아이콘: 전면 배경, 마크는 안전 영역 안.
writeIcon(join(ICONS_DIR, 'icon-maskable-512.png'), 512, { fullBleed: true })
// iOS 홈 화면 아이콘: iOS가 자체적으로 모서리를 둥글리므로 전면 배경으로.
writeIcon(join(PUBLIC_DIR, 'apple-touch-icon.png'), 180, { fullBleed: true })
// 파비콘: 48px에서도 고리 두께(size*0.15 = 7.2px)가 충분히 두꺼워 별도 보정 없음.
writeIcon(join(PUBLIC_DIR, 'favicon.png'), 48, { fullBleed: true })

console.log('Done.')
