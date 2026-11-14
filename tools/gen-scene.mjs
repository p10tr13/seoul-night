// Generates hooks/scene.ts for the seoul-night mod: a neon alley with a pocha tent.
// Usage: node tools/gen-scene.mjs hooks <preview dir>
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2]
let seed = 777
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = arr => arr[Math.floor(rnd() * arr.length)]
const r = n => Math.round(n * 10) / 10

const W = 1600
const H = 1000
const VX = 800
const VY = 460
const WALL_L = 200
const WALL_R = 1400
const GROUND = 900
const FAR = 0.36 // where the alley ends: higher = slower convergence

const P = (x, y, k) => [r(VX + (x - VX) * k), r(VY + (y - VY) * k)]
const pts = list => list.map(p => p.join(',')).join(' ')
const depth = k => `transform="translate(${VX} ${VY}) scale(${k}) translate(${-VX} ${-VY})"`
const quad = (x1, y1, x2, y2, kA, kB, attrs) =>
  `<polygon points="${pts([P(x1, y1, kA), P(x2, y2, kA), P(x2, y2, kB), P(x1, y1, kB)])}" ${attrs}/>`
// A rectangle on a side wall plane (constant x) between depths kA and kB, from y1 to y2.
const wallRect = (x, y1, y2, kA, kB, attrs) =>
  `<polygon points="${pts([P(x, y1, kA), P(x, y1, kB), P(x, y2, kB), P(x, y2, kA)])}" ${attrs}/>`

const items = [] // [depth, svg], drawn far to near
const FONT = `font-family="'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif"`

// Walls and street.
const topL = P(WALL_L, -300, FAR)
const topR = P(WALL_R, -300, FAR)
const lw = [[0, -10], [WALL_L + (topL[0] - WALL_L) * ((-10 + 300) / (topL[1] + 300)), -10], topL, P(WALL_L, GROUND, FAR), [WALL_L, GROUND], [0, GROUND + 0.73 * WALL_L]]
const rw = [[W, -10], [WALL_R + (topR[0] - WALL_R) * ((-10 + 300) / (topR[1] + 300)), -10], topR, P(WALL_R, GROUND, FAR), [WALL_R, GROUND], [W, GROUND + 0.73 * (W - WALL_R)]]
const street = [[0, GROUND + 0.73 * WALL_L], P(WALL_L, GROUND, FAR), P(WALL_R, GROUND, FAR), [W, GROUND + 0.73 * (W - WALL_R)], [W, H], [0, H]]

// Far city at the end of the alley.
const farBase = P(0, GROUND, FAR)[1]
let far = ''
let farWin = ''
let farNeon = ''
for (let x = P(WALL_L, 0, FAR)[0] - 40; x < P(WALL_R, 0, FAR)[0] + 40; ) {
  const w = 26 + Math.round(rnd() * 40)
  const h = 120 + Math.round(rnd() * 230)
  far += `<rect x="${x}" y="${farBase - h}" width="${w}" height="${h}"/>`
  for (let i = 0; i < 10; i++) {
    if (rnd() < 0.55) {
      farWin += `<rect x="${r(x + 3 + rnd() * (w - 7))}" y="${r(farBase - h + 4 + rnd() * (h - 10))}" width="2.5" height="3.5"/>`
    }
  }
  if (rnd() < 0.45) {
    const c = pick(['#ff4fa3', '#5ff3ff', '#ffd23f', '#7dffb0', '#ff7a3d', '#c9a2ff'])
    farNeon += `<rect x="${x + w / 2 - 3}" y="${r(farBase - h + 10 + rnd() * h * 0.4)}" width="7" height="${r(20 + rnd() * 30)}" fill="${c}"/>`
  }
  x += w + 3
}

// Upper-floor windows and lit shop fronts on both walls.
let wallWin = ''
let shops = ''
for (const wx of [WALL_L, WALL_R]) {
  for (let k = 1.3; k > FAR; k *= 0.88) {
    for (let y = -120; y < 520; y += 95) {
      if (rnd() > 0.3) continue
      wallWin += wallRect(wx, y, y + 50, k, k * 0.95, `fill="${pick(['#ffd28a', '#ffe3b0', '#9fd8ff'])}" opacity="${r(0.12 + rnd() * 0.2)}"`)
    }
  }
  const aw = wx === WALL_L ? 34 : -34
  for (let k = 1.4; k > FAR; ) {
    const k2 = Math.max(FAR, k * (0.8 + rnd() * 0.06))
    shops += wallRect(wx, 610, GROUND, k, k2, `fill="${pick(['#ffb86b', '#ff7aa8', '#7fe0ff', '#ffd98a', '#c9a2ff', '#ff9f6b'])}" opacity="${r(0.14 + rnd() * 0.16)}"`)
    shops += `<polygon points="${pts([P(wx, 590, k), P(wx, 590, k2), P(wx + aw, 625, k2), P(wx + aw, 625, k)])}" fill="${pick(['#b8324f', '#2d5f8a', '#c2562b', '#5b3a8c'])}" opacity=".55"/>`
    k = k2 * 0.97
  }
}

// Paving and the yellow lines along the road's edges.
let paving = ''
for (let x = -1200; x <= W + 1200; x += 120) {
  const [x2, y2] = P(x, GROUND, FAR)
  const [x1, y1] = P(x, GROUND, 2.2)
  paving += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`
}
for (let k = FAR; k < 2.2; k *= 1.09) {
  const [x1, y] = P(WALL_L, GROUND, k)
  const [x2] = P(WALL_R, GROUND, k)
  paving += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>`
}
const LINE_L = 590
const LINE_R = 1080
const yellow =
  quad(LINE_L, GROUND, LINE_L + 12, GROUND, 2.4, FAR, 'fill="#ffc21a"') +
  quad(LINE_L + 24, GROUND, LINE_L + 36, GROUND, 2.4, FAR, 'fill="#ffc21a"') +
  quad(LINE_R, GROUND, LINE_R + 12, GROUND, 2.4, FAR, 'fill="#ffc21a"')
const yellowGlow = quad(LINE_L - 10, GROUND, LINE_L + 46, GROUND, 2.4, FAR, 'fill="#ffc21a" opacity=".18"') +
  quad(LINE_R - 10, GROUND, LINE_R + 22, GROUND, 2.4, FAR, 'fill="#ffc21a" opacity=".18"')

// Neon signs projecting from the walls.
const left = [
  ['포차', '#ff4f6d', 'v'], ['GS25', '#4fc8ff', 'h'], ['노래방', '#ff4fd2', 'v'], ['부동산', '#ffe066', 'v'],
  ['치킨', '#ffa23d', 'v'], ['약국', '#5dff9a', 'h'], ['화장품', '#ff8fc8', 'v'], ['분식', '#ff6a3d', 'v'],
  ['24시', '#7fd8ff', 'h'], ['호프', '#ffd23f', 'v'], ['맛집', '#ff5a8a', 'v'], ['노래방', '#ff9d3d', 'v'],
]
const right = [
  ['노래방', '#8f86ff', 'v'], ['카페', '#c9a2ff', 'v'], ['PC방', '#5ff3ff', 'h'], ['편의점', '#7dffb0', 'v'],
  ['고기', '#ff5468', 'v'], ['떡볶이', '#ff7a3d', 'v'], ['네일', '#ff9ee0', 'h'], ['커피', '#ffd9a0', 'v'],
  ['술집', '#ff4fa3', 'v'], ['emart', '#ffcf4a', 'h'], ['부동산', '#9dff6b', 'v'], ['GS25', '#4fc8ff', 'h'],
]
const signFor = (text, color, kind, side, i) => {
  const chars = [...text]
  const v = kind === 'v'
  const w = v ? 92 : Math.max(150, chars.length * 40 + 30)
  const h = v ? chars.length * 74 + 40 : 84
  const x = side === 'l' ? WALL_L + 18 + (i % 2) * 40 : WALL_R - 18 - (i % 2) * 40 - w
  // the GS25 on the right hangs low, right over the store's door
  const y = text === 'GS25' && side === 'r' ? 455 : v ? 40 + (i % 3) * 80 : 110 + (i % 3) * 120
  const cls = pick(['n1', 'n2', 'n3', 'n4', '', ''])
  const fs = v ? 58 : 50
  const label = v
    ? chars.map((c, j) => `<text x="${x + w / 2}" y="${y + 78 + j * 74}">${c}</text>`).join('')
    : `<text x="${x + w / 2}" y="${y + h / 2 + 18}">${text}</text>`
  return `<g${cls ? ` class="${cls}"` : ''}>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#0d0818" fill-opacity=".86" stroke="${color}" stroke-width="5" filter="url(#glow)"/>` +
    `<g fill="${color}" filter="url(#glow)" font-size="${fs}" font-weight="700" text-anchor="middle" ${FONT}>${label}</g>` +
    `<rect x="${side === 'l' ? WALL_L : x + w}" y="${y + 20}" width="${side === 'l' ? x - WALL_L : WALL_R - x - w}" height="6" fill="#1a1426"/>` +
    `</g>`
}
let glows = ''
for (let i = 0; i < 12; i++) {
  const k = FAR * 1.04 * Math.pow(1.105, i)
  for (const [list, side] of [[left, 'l'], [right, 'r']]) {
    const [text, color, kind] = list[i]
    items.push([k, `<g ${depth(k)}>${signFor(text, color, kind, side, i)}</g>`])
    const [cx, cy] = P(side === 'l' ? WALL_L + 120 : WALL_R - 120, GROUND + 40, k)
    glows += `<ellipse cx="${cx}" cy="${cy}" rx="${r(150 * k)}" ry="${r(40 * k)}" fill="${color}" opacity=".2"/>`
  }
}

// Overhead wires with string lights.
let wires = ''
let bulbs = ''
for (const k of [0.44, 0.58, 0.78, 1.05]) {
  const [x1, y1] = P(WALL_L, 10, k)
  const [x2, y2] = P(WALL_R, 30, k)
  const cy = (y1 + y2) / 2 + 140 * k
  wires += `<path d="M${x1} ${y1} Q${VX} ${r(cy)} ${x2} ${y2}"/>`
  for (let t = 0.06; t < 0.96; t += 0.075) {
    const bx = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * VX + t * t * x2
    const by = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t * t * y2
    bulbs += `<circle cx="${r(bx)}" cy="${r(by + 3 * k)}" r="${r(Math.max(1.4, 5 * k))}"/>`
  }
}

// Critter: a round terracotta body; (x, bottom) of its body, `legs` when standing.
const critterBody = (x, bottom, { legs = true, extra = '', cls = '', tipsy = false, walking = false, wave = false } = {}) => {
  const y = bottom - 104
  const origin = ` style="transform-origin:${x + 75}px ${bottom}px"`
  const face = tipsy
    ? // flushed face, heavy half-closed eyes, red cheeks with blush marks, a raised glass, a hiccup
      `<rect x="${x}" y="${y}" width="150" height="104" rx="34" fill="url(#flush)"/>` +
      [x + 50, x + 100].map((ex, j) => {
        const ey = y + 46 + j * 3
        // heavy lids drooping toward the outer corners
        const [dl, dr] = j === 0 ? [5, 1] : [1, 5]
        return `<ellipse cx="${ex}" cy="${ey}" rx="10" ry="11" fill="#1d1420"/>` +
          `<polygon points="${ex - 14},${ey - 14} ${ex + 14},${ey - 14} ${ex + 14},${ey + dr} ${ex - 14},${ey + dl}" fill="#e06a55"/>` +
          `<path d="M${ex - 13} ${ey + dl} L${ex + 13} ${ey + dr}" stroke="#1d1420" stroke-width="3.5" stroke-linecap="round"/>` +
          `<circle cx="${ex + (j === 0 ? 3 : -3)}" cy="${ey + 7}" r="2.2" fill="#fff" opacity=".8"/>`
      }).join('') +
      `<ellipse cx="${x + 34}" cy="${y + 70}" rx="20" ry="11" fill="#ff3355" opacity=".75"/>` +
      `<ellipse cx="${x + 116}" cy="${y + 70}" rx="20" ry="11" fill="#ff3355" opacity=".75"/>` +
      `<path d="M${x + 24} ${y + 74} l6 -9 M${x + 33} ${y + 75} l6 -9 M${x + 42} ${y + 74} l6 -9 M${x + 106} ${y + 74} l6 -9 M${x + 115} ${y + 75} l6 -9 M${x + 124} ${y + 74} l6 -9" stroke="#b8123a" stroke-width="2.5" stroke-linecap="round"/>` +
      `<path d="M${x + 64} ${y + 82} q11 7 22 0" stroke="#7a1f2a" stroke-width="3" fill="none" stroke-linecap="round"/>` +
      `<rect x="${x + 160}" y="${y + 18}" width="14" height="20" rx="2" fill="#dff4ff" opacity=".75"/>` +
      `<rect x="${x + 161}" y="${y + 26}" width="12" height="11" fill="#f4fbff"/>` +
      `<rect x="${x + 146}" y="${y + 34}" width="24" height="16" rx="8" fill="#c96a4b"/>` +
      `<g class="hic" style="transform-origin:${x + 130}px ${y - 10}px"><text x="${x + 112}" y="${y - 14}" font-size="30" font-weight="700" fill="#ffd6de" ${FONT}>딸꾹</text>` +
      `<circle cx="${x + 104}" cy="${y - 4}" r="5" fill="#ffd6de" opacity=".7"/><circle cx="${x + 94}" cy="${y + 6}" r="3" fill="#ffd6de" opacity=".6"/></g>`
    : ''
  return `<g${cls ? ` class="${cls}"` : ''}${origin}>` +
    (legs
      ? `<ellipse cx="${x + 75}" cy="${bottom + 34}" rx="70" ry="12" fill="#000" opacity=".35"/>` +
        `<rect${walking ? ' class="lg1"' : ''} x="${x + 22}" y="${bottom - 4}" width="18" height="38" rx="6" fill="#b85c3c"/>` +
        `<rect${walking ? ' class="lg2"' : ''} x="${x + 110}" y="${bottom - 4}" width="18" height="38" rx="6" fill="#b85c3c"/>`
      : '') +
    `<rect x="${x}" y="${y}" width="150" height="104" rx="34" fill="#d97757"/>` +
    `<rect x="${x - 16}" y="${y + 46}" width="22" height="18" rx="8" fill="#c96a4b"/>` +
    (tipsy
      ? face
      : `<rect${wave ? ` class="wave" style="transform-origin:${x + 146}px ${y + 55}px"` : ''} x="${x + 144}" y="${y + 46}" width="22" height="18" rx="8" fill="#c96a4b"/>` +
        `<g class="blink" style="transform-origin:${x + 75}px ${y + 44}px">` +
        `<ellipse cx="${x + 50}" cy="${y + 44}" rx="9" ry="13" fill="#1d1420"/>` +
        `<ellipse cx="${x + 100}" cy="${y + 44}" rx="9" ry="13" fill="#1d1420"/>` +
        `<circle cx="${x + 53}" cy="${y + 39}" r="3.5" fill="#fff"/><circle cx="${x + 103}" cy="${y + 39}" r="3.5" fill="#fff"/></g>` +
        `<ellipse cx="${x + 36}" cy="${y + 66}" rx="10" ry="6" fill="#ff8f86" opacity=".6"/>` +
        `<ellipse cx="${x + 114}" cy="${y + 66}" rx="10" ry="6" fill="#ff8f86" opacity=".6"/>`) +
    extra + `</g>`
}

// A convenience store front on the right wall: bright glass, double doors, shelves, a snack rack.
const store = () => {
  const kA = 1.34
  const kB = 0.97
  const kd = [1.22, 1.12] // the double door
  let s = ''
  s += wallRect(WALL_R, 560, GROUND, kA, kB, 'fill="#1c1f2a"')
  s += wallRect(WALL_R, 640, GROUND - 22, kA, kB, 'fill="url(#store)"')
  s += wallRect(WALL_R, 652, 657, kA, kB, 'fill="#ffffff" opacity=".9"')
  for (const y of [712, 764, 816]) {
    s += wallRect(WALL_R, y, y + 5, kA, kd[0], 'fill="#8796a8"') + wallRect(WALL_R, y, y + 5, kd[1], kB, 'fill="#8796a8"')
    for (let k = kA; k > kB; k *= 0.985) {
      if (k < kd[0] && k > kd[1]) continue
      if (rnd() < 0.25) continue
      const hgt = 14 + rnd() * 16
      s += wallRect(WALL_R, y - hgt, y, k, k * 0.99, `fill="${pick(['#ff4d4d', '#ffcf3d', '#3db5ff', '#5bd16b', '#ff8a3d', '#c77dff', '#ffffff'])}"`)
    }
  }
  for (const k of [kA, 1.27, ...kd, 1.04, kB]) {
    const [x1, y1] = P(WALL_R, 640, k)
    const [x2, y2] = P(WALL_R, GROUND - 22, k)
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2b2f3a" stroke-width="${r(5 * k)}"/>`
  }
  const km = Math.sqrt(kd[0] * kd[1])
  const [mx1, my1] = P(WALL_R, 640, km)
  const [mx2, my2] = P(WALL_R, GROUND - 22, km)
  s += `<line x1="${mx1}" y1="${my1}" x2="${mx2}" y2="${my2}" stroke="#2b2f3a" stroke-width="${r(3 * km)}"/>`
  for (const k of [km * 1.012, km / 1.012]) {
    const [hx1, hy1] = P(WALL_R, 740, k)
    const [hx2, hy2] = P(WALL_R, 800, k)
    s += `<line x1="${hx1}" y1="${hy1}" x2="${hx2}" y2="${hy2}" stroke="#d8dde6" stroke-width="${r(4 * k)}"/>`
  }
  s += wallRect(WALL_R, 568, 604, kA, kB, 'fill="#2aa7dc"')
  s += wallRect(WALL_R, 604, 609, kA, kB, 'fill="#f4fbff" opacity=".85"')
  s += `<polygon points="${pts([P(WALL_R, 612, kA), P(WALL_R, 612, kB), P(WALL_R - 46, 638, kB), P(WALL_R - 46, 638, kA)])}" fill="#3a3f4a"/>`
  s += `<polygon points="${pts([P(WALL_R - 46, GROUND, kA), P(WALL_R - 46, GROUND, kB), P(WALL_R, GROUND, kB), P(WALL_R, GROUND, kA)])}" fill="#3b3442"/>`
  items.push([kB, s])
  const [lx, ly] = P(WALL_R - 170, GROUND + 30, 1.15)
  glows += `<ellipse cx="${lx}" cy="${ly}" rx="230" ry="60" fill="#cfefff" opacity=".35"/>`
  // the ice cream chest freezer, its back against the store wall, beside the door
  const kF1 = 1.105
  const kF2 = 1.0
  const fo = WALL_R - 64 // its street-facing side
  const ft = GROUND - 92 // its lid
  const lid = (x1, x2, k1, k2, attrs) =>
    `<polygon points="${pts([P(x1, ft, k1), P(x2, ft, k1), P(x2, ft, k2), P(x1, ft, k2)])}" ${attrs}/>`
  let fr = ''
  // the long side facing the street, with the blue band and its word laid on that plane
  fr += wallRect(fo, ft, GROUND, kF1, kF2, 'fill="#e6ebf2"')
  fr += wallRect(fo, ft + 12, ft + 38, kF1, kF2, 'fill="#2aa7dc"')
  // read left to right on screen: from the far end to the near one
  const [ax, ay] = P(fo, ft + 12, kF2)
  const [bx, by] = P(fo, ft + 12, kF1)
  const kAvg = (kF1 + kF2) / 2
  fr += `<g transform="matrix(${r((bx - ax) / 140 * 1000) / 1000} ${r((by - ay) / 140 * 1000) / 1000} 0 ${kAvg} ${ax} ${ay})">` +
    `<text x="70" y="20" font-size="18" font-weight="700" fill="#fff" text-anchor="middle" ${FONT}>아이스크림</text></g>`
  // the glass lid seen from above, ice creams beneath it
  fr += lid(fo, WALL_R, kF1, kF2, 'fill="#16324a"')
  for (let i = 0; i < 18; i++) {
    const u = fo + 6 + (i % 6) * 9
    const k = kF1 - (Math.floor(i / 6) + 0.2) * ((kF1 - kF2) / 3.2)
    fr += lid(u, u + 7, k, k - (kF1 - kF2) / 4.5, `fill="${pick(['#ff5c8a', '#ffd23f', '#5ec8ff', '#7be07b', '#ffffff', '#ff9a3d', '#b28bff'])}"`)
  }
  fr += lid(fo, WALL_R, kF1, kF2, 'fill="#d8f3ff" opacity=".3" stroke="#e9eef5" stroke-width="2.5"')
  const kMid = Math.sqrt(kF1 * kF2)
  fr += `<line x1="${P(fo, ft, kMid)[0]}" y1="${P(fo, ft, kMid)[1]}" x2="${P(WALL_R, ft, kMid)[0]}" y2="${P(WALL_R, ft, kMid)[1]}" stroke="#e9eef5" stroke-width="2.5"/>`
  // the short end facing the viewer
  fr += `<g ${depth(kF1)}><rect x="${fo}" y="${ft}" width="${WALL_R - fo}" height="${GROUND - ft}" fill="#f4f7fb"/>` +
    `<rect x="${fo}" y="${ft + 12}" width="${WALL_R - fo}" height="26" fill="#2aa7dc"/></g>`
  const [gx, gy] = P(fo - 30, GROUND + 10, kMid)
  glows += `<ellipse cx="${gx}" cy="${gy}" rx="90" ry="22" fill="#bfe9ff" opacity=".35"/>`
  items.push([kF2 + 0.001, fr])
}
store()
const walker = (x, k, cls, extra = '') =>
  items.push([k, `<g ${depth(k)}>${critterBody(x, GROUND - 34, { cls, extra })}</g>`])

// The pocha: an orange tent on the left, open to the viewer, with tables outside.
const TX0 = 205
const TX1 = 455
const TOP = 560
const KA = 0.88
const KB = 0.58
const pocha = () => {
  let s = ''
  // roof seen from above the eye line, then the street-facing side
  s += `<polygon points="${pts([P(TX0, TOP, KA), P(TX1, TOP, KA), P(TX1, TOP, KB), P(TX0, TOP, KB)])}" fill="#a8401c"/>`
  s += wallRect(TX1, TOP, GROUND, KA, KB, 'fill="url(#tarp)"')
  for (let k = KA; k > KB; k *= 0.93) {
    s += `<line x1="${P(TX1, TOP, k)[0]}" y1="${P(TX1, TOP, k)[1]}" x2="${P(TX1, GROUND, k)[0]}" y2="${P(TX1, GROUND, k)[1]}" stroke="#9c3a17" stroke-width="${r(3 * k)}"/>`
  }
  s += wallRect(TX1, 640, 790, 0.82, 0.64, 'fill="#ffcf7a" opacity=".85" class="lamp"')
  s += wallRect(TX1, 610, 640, 0.82, 0.64, 'fill="#c94a1f"')
  // front face, at depth KA
  const f = `<g ${depth(KA)}>` +
    `<rect x="${TX0}" y="${TOP}" width="${TX1 - TX0}" height="${GROUND - TOP}" fill="#e8622c"/>` +
    `<rect x="${TX0 + 26}" y="${TOP + 70}" width="${TX1 - TX0 - 52}" height="${GROUND - TOP - 70}" fill="url(#inside)"/>` +
    `<rect x="${TX0 + 40}" y="${GROUND - 120}" width="${TX1 - TX0 - 80}" height="50" fill="#7a2c14"/>` +
    `<rect x="${TX0 + 40}" y="${GROUND - 128}" width="${TX1 - TX0 - 80}" height="10" fill="#c96a3a"/>` +
    `<line x1="${(TX0 + TX1) / 2}" y1="${TOP + 70}" x2="${(TX0 + TX1) / 2}" y2="${TOP + 110}" stroke="#2a1a14" stroke-width="2"/>` +
    `<circle class="lamp" cx="${(TX0 + TX1) / 2}" cy="${TOP + 118}" r="10" fill="#fff1c4" filter="url(#glow)"/>` +
    `<path d="M${TX0 + 26} ${TOP + 70} q40 60 0 140 z M${TX1 - 26} ${TOP + 70} q-40 60 0 140 z" fill="#d1531f"/>` +
    `<rect x="${TX0 - 6}" y="${TOP - 4}" width="${TX1 - TX0 + 12}" height="66" rx="6" fill="#c42a35"/>` +
    `<g fill="#fff3d6" font-size="44" font-weight="700" text-anchor="middle" ${FONT}><text x="${(TX0 + TX1) / 2}" y="${TOP + 46}">포차</text></g>` +
    `</g>`
  items.push([KB, s])
  items.push([KA, f])
}
pocha()

// A folding table with red stools, soju and a dish; seats: 'l'/'r' critters.
const table = (cx, k, seats = [], { snacks = false } = {}) => {
  const top = GROUND - 120
  const stool = sx =>
    `<rect x="${sx - 34}" y="${GROUND - 70}" width="68" height="12" rx="4" fill="#e0303f"/>` +
    `<path d="M${sx - 30} ${GROUND - 58} L${sx - 36} ${GROUND} M${sx + 30} ${GROUND - 58} L${sx + 36} ${GROUND}" stroke="#b81f2d" stroke-width="9"/>`
  const bottle = bx =>
    `<rect x="${bx}" y="${top - 48}" width="16" height="44" rx="4" fill="#2fa35a" opacity=".92"/>` +
    `<rect x="${bx + 5}" y="${top - 64}" width="6" height="18" fill="#2fa35a"/>` +
    `<rect x="${bx + 2}" y="${top - 32}" width="12" height="12" fill="#e8f5ec" opacity=".85"/>`
  const glass = gx => `<rect x="${gx}" y="${top - 16}" width="10" height="14" fill="#dff4ff" opacity=".6"/>`
  let s = `<ellipse cx="${cx}" cy="${GROUND + 6}" rx="150" ry="18" fill="#000" opacity=".3"/>`
  s += stool(cx - 120) + stool(cx + 120)
  if (seats.includes('l')) s += critterBody(cx - 205, GROUND - 70, { legs: false, cls: 'sip1' })
  if (seats.includes('r')) s += critterBody(cx + 55, GROUND - 70, { legs: false, cls: 'sip2' })
  if (seats.includes('R')) s += critterBody(cx + 55, GROUND - 70, { legs: false, cls: 'tipsy', tipsy: true })
  s += `<path d="M${cx - 60} ${top + 8} L${cx + 60} ${GROUND} M${cx + 60} ${top + 8} L${cx - 60} ${GROUND}" stroke="#d9d9e0" stroke-width="6"/>`
  s += `<ellipse cx="${cx}" cy="${top + 6}" rx="88" ry="20" fill="#9e1f2c"/>`
  s += `<ellipse cx="${cx}" cy="${top}" rx="88" ry="20" fill="#e8394f"/>`
  if (snacks) {
    // makgeolli: a cream plastic bottle with a green cap, brass bowls, sliced kimbap, kimchi
    s += `<ellipse cx="${cx - 28}" cy="${top + 1}" rx="38" ry="9" fill="#f5f5f5"/>`
    for (let i = 0; i < 6; i++) {
      const kx = cx - 54 + (i % 3) * 17 + (i >= 3 ? 8 : 0)
      const ky = top - 2 + (i >= 3 ? 5 : 0) - 3
      s += `<ellipse cx="${kx}" cy="${ky}" rx="8" ry="5.5" fill="#1f2b1f"/><ellipse cx="${kx}" cy="${ky}" rx="6" ry="4" fill="#fbfbf6"/>` +
        `<circle cx="${kx - 1.5}" cy="${ky - 0.5}" r="1.4" fill="#ff9a3d"/><circle cx="${kx + 1.5}" cy="${ky + 0.5}" r="1.4" fill="#3dbb5b"/><circle cx="${kx}" cy="${ky - 2}" r="1.2" fill="#ffd23f"/>`
    }
    s += `<ellipse cx="${cx + 12}" cy="${top + 8}" rx="14" ry="5" fill="#f5f5f5"/><ellipse cx="${cx + 12}" cy="${top + 6}" rx="9" ry="3.5" fill="#e0402b"/>`
    s += `<rect x="${cx + 26}" y="${top - 58}" width="22" height="56" rx="6" fill="#f3eee0"/>` +
      `<rect x="${cx + 31}" y="${top - 70}" width="12" height="14" rx="3" fill="#2e9e4f"/>` +
      `<rect x="${cx + 26}" y="${top - 38}" width="22" height="14" fill="#2e9e4f"/>` +
      `<circle cx="${cx + 37}" cy="${top - 31}" r="3.5" fill="#f3eee0"/>`
    for (const bx of [cx + 66, cx - 70]) {
      s += `<ellipse cx="${bx}" cy="${top - 4}" rx="15" ry="6" fill="#c9952f"/><ellipse cx="${bx}" cy="${top - 6}" rx="12" ry="4" fill="#f4efe0"/>`
    }
  } else {
    s += `<ellipse cx="${cx + 20}" cy="${top - 4}" rx="30" ry="8" fill="#ff8a3d"/>`
    s += bottle(cx - 52) + bottle(cx - 30) + glass(cx + 48) + glass(cx - 6)
  }
  items.push([k, `<g ${depth(k)}>${s}</g>`])
}
table(340, 0.98, ['l'], { snacks: true })
table(345, 1.12, ['l', 'R'])

// Critters by the store, always moving: one waves, one hops.
items.push([0.72, `<g ${depth(0.72)}>${critterBody(1150, GROUND - 34, { cls: 'bob1', wave: true })}</g>`])
items.push([0.9, `<g ${depth(0.9)}>${critterBody(1200, GROUND - 34, { cls: 'hop' })}</g>`])

// Critters walking along the road, toward the viewer and away, looping.
let moverCss = ''
const mover = (id, x, kFrom, kTo, dur, delay) => {
  const tf = k => `translate(${VX}px,${VY}px) scale(${k}) translate(${-VX}px,${-VY}px)`
  moverCss += `.${id}{animation:${id} ${dur}s linear infinite ${delay}s}` +
    `@keyframes ${id}{0%{transform:${tf(kFrom)};opacity:0}8%{opacity:1}88%{opacity:1}100%{transform:${tf(kTo)};opacity:0}}`
  items.push([(kFrom + kTo) / 2, `<g class="${id}" ${depth(kFrom)}>${critterBody(x, GROUND - 34, { cls: 'step', walking: true })}</g>`])
}
mover('wa', 940, 0.4, 1.0, 22, -6)
mover('wb', 640, 0.95, 0.4, 26, -15)

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<style>
.n1{animation:nf 7s linear infinite}
.n2{animation:nf 11s linear infinite 3s}
.n3{animation:nf 15s linear infinite 6s}
.n4{animation:pulse 4s ease-in-out infinite}
@keyframes nf{0%,100%{opacity:1}92%{opacity:1}93%{opacity:.3}94%{opacity:1}95.5%{opacity:.45}96.5%{opacity:1}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.7}}
.lamp{animation:pulse 5s ease-in-out infinite}
.bulbs circle{animation:tw 3s ease-in-out infinite}
.bulbs circle:nth-child(3n){animation-delay:1s}
.bulbs circle:nth-child(3n+1){animation-delay:2s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:.35}}
.bob1{animation:bob 2.6s ease-in-out infinite}
.bob2{animation:bob 3.1s ease-in-out infinite .8s}
.bob3{animation:bob 2.2s ease-in-out infinite 1.5s}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
.sip1{animation:chat 2.4s ease-in-out infinite}
.sip2{animation:chat 2.9s ease-in-out infinite 1.1s}
@keyframes chat{0%,100%{transform:rotate(0) translateY(0)}25%{transform:rotate(-3deg) translateY(-5px)}50%{transform:rotate(0) translateY(0)}75%{transform:rotate(3deg) translateY(-3px)}}
.hop{animation:hop 1.6s ease-in-out infinite}
@keyframes hop{0%,100%{transform:translateY(0) scale(1.06,.94)}15%{transform:translateY(0) scale(.96,1.04)}45%{transform:translateY(-28px) scale(1)}75%{transform:translateY(0) scale(1.08,.92)}}
.wave{animation:wave 1s ease-in-out infinite}
@keyframes wave{0%,100%{transform:rotate(0)}50%{transform:rotate(-55deg)}}
.step{animation:bob .6s ease-in-out infinite}
.lg1{animation:leg .6s ease-in-out infinite}
.lg2{animation:leg .6s ease-in-out infinite .3s}
@keyframes leg{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
${moverCss}
.tipsy{animation:sway 3.4s ease-in-out infinite}
@keyframes sway{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
.hic{animation:hic 3.5s ease-in-out infinite}
@keyframes hic{0%,70%,100%{transform:translateY(0) scale(1)}76%{transform:translateY(-10px) scale(1.18)}84%{transform:translateY(0) scale(.96)}}
.blink{animation:bl 5s linear infinite}
.bob2 .blink,.sip1 .blink{animation-delay:1.7s}
.bob3 .blink,.sip2 .blink{animation-delay:3.1s}
@keyframes bl{0%,94%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}
.haze{animation:drift 60s ease-in-out infinite alternate}
@keyframes drift{from{transform:translateX(-60px)}to{transform:translateX(60px)}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}
</style>
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#060718"/><stop offset=".5" stop-color="#1c1542"/><stop offset="1" stop-color="#5a2358"/></linearGradient>
<linearGradient id="wallL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a0817"/><stop offset="1" stop-color="#1b1433"/></linearGradient>
<linearGradient id="wallR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#0a0817"/><stop offset="1" stop-color="#1b1433"/></linearGradient>
<linearGradient id="street" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#141020"/><stop offset=".7" stop-color="#2a1d33"/><stop offset="1" stop-color="#46293f"/></linearGradient>
<linearGradient id="tarp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f07a3a"/><stop offset="1" stop-color="#c94a1f"/></linearGradient>
<radialGradient id="inside" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#ffe2a0"/><stop offset=".6" stop-color="#ffab55"/><stop offset="1" stop-color="#b8521e"/></radialGradient>
<radialGradient id="vp" cx=".5" cy=".55" r=".3"><stop offset="0" stop-color="#ffb3d9" stop-opacity=".4"/><stop offset="1" stop-color="#ffb3d9" stop-opacity="0"/></radialGradient>
<radialGradient id="warm" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffa64d" stop-opacity=".45"/><stop offset="1" stop-color="#ffa64d" stop-opacity="0"/></radialGradient>
<radialGradient id="flush" cx=".5" cy=".62" r=".6"><stop offset="0" stop-color="#ff3d5a" stop-opacity=".5"/><stop offset="1" stop-color="#ff3d5a" stop-opacity="0"/></radialGradient>
<linearGradient id="store" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6fcff"/><stop offset="1" stop-color="#bfe3f7"/></linearGradient>
<filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<g fill="#120e2a">${far}</g>
<g fill="#ffd28a" opacity=".7">${farWin}</g>
<g opacity=".8" filter="url(#glow)">${farNeon}</g>
<rect width="${W}" height="${H}" fill="url(#vp)"/>
<polygon points="${pts(street)}" fill="url(#street)"/>
<g stroke="#ffffff" stroke-opacity=".045" stroke-width="2">${paving}</g>
<g filter="url(#soft)">${glows}${yellowGlow}</g>
${yellow}
<ellipse cx="300" cy="880" rx="360" ry="120" fill="url(#warm)"/>
<polygon points="${pts(lw)}" fill="url(#wallL)"/>
<polygon points="${pts(rw)}" fill="url(#wallR)"/>
<g>${wallWin}</g>
<g>${shops}</g>
<ellipse class="haze" cx="800" cy="600" rx="420" ry="60" fill="#c58ad6" opacity=".12" filter="url(#soft)"/>
<g fill="none" stroke="#05040c" stroke-width="2">${wires}</g>
<g class="bulbs" fill="#ffe2a8" filter="url(#glow)">${bulbs}</g>
${items.sort((a, b) => a[0] - b[0]).map(i => i[1]).join('')}
</svg>`

writeFileSync(join(out, 'scene.ts'), `// Generated by tools/gen-scene.mjs: a neon alley with a pocha for the seoul-night look.\nexport const SCENE = ${JSON.stringify(svg)}\n`)
writeFileSync(join(process.argv[3] ?? out, 'alley.svg'), svg)
console.log('scene chars:', svg.length)
