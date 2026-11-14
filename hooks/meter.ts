// The band above the prompt as one pixel-art SVG: a somaek glass (the 5-hour limit), a soju
// bottle (the weekly limit), a fishcake skewer (the context window), a critter, and the workday:
// time worked, overtime, git and CI.
// Pure: it takes the figures and returns markup, so it renders the same anywhere.

import { CRITTER_CSS, critterSvg } from './critter'
import type { Activity } from './critter'

import type { CiState, Git, Meter, Work } from '../types'

export type { CiState, Git, Meter, Work }

export type BandFigures = {
  meter: Meter | null
  work: Work | null
  git: Git | null
  activity: Activity | null
  /** True while a turn runs. */
  isWorking: boolean
  now: number
}

const PX = 4
const FONT = `font-family="'Galmuri11','DungGeunMo','Malgun Gothic','Apple SD Gothic Neo',monospace"`

// Draws a sprite: one string per row, one character per pixel, '.' transparent.
// Runs of one color in a row become one rect, so the markup stays small.
const sprite = (rows: string[], palette: Record<string, string>, x: number, y: number): string => {
  let out = ''
  rows.forEach((row, j) => {
    let i = 0
    while (i < row.length) {
      const c = row[i] ?? '.'
      let n = 1
      while (row[i + n] === c) n++
      const fill = palette[c]
      if (c !== '.' && fill !== undefined) {
        out += `<rect x="${x + i * PX}" y="${y + j * PX}" width="${n * PX}" height="${PX}" fill="${fill}"/>`
      }
      i += n
    }
  })
  return out
}

export const clamp = (n: number) => Math.max(0, Math.min(100, n))

export const untilReset = (iso: string | null, now: number): string | null => {
  if (iso === null) return null
  const ms = Date.parse(iso) - now
  if (!Number.isFinite(ms) || ms <= 0) return '곧 리셋'
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes}분 후 리셋`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 ${minutes % 60}분 후 리셋`
  return hours % 24 === 0 ? `${hours / 24}일 후 리셋` : `${Math.floor(hours / 24)}일 ${hours % 24}시간 후 리셋`
}

export const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`

// The workday by the machine's own clock: the weekend, overtime after 18:00, or time to leave.
export const workday = (now: number, offset: number | null): { label: string; color: string } => {
  if (offset === null) return { label: '근무 중', color: '#5ff3ff' }
  const local = new Date(now + offset * 60000)
  const day = local.getUTCDay()
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes()
  if (day === 0 || day === 6) return { label: '주말 출근 중…', color: '#ff5fa8' }
  if (minutes >= 18 * 60 || minutes < 6 * 60) return { label: '야근 중…', color: '#ff5468' }
  if (minutes < 9 * 60) return { label: '출근 전인데…', color: '#ffcf4a' }
  return { label: `칼퇴까지 ${hm(18 * 60 - minutes)}`, color: '#5ff3ff' }
}

// The somaek glass: 14 x 24 pixels, filled from the bottom with what is left.
const glass = (left: number | null, x: number, y: number): string => {
  const W = 14
  const H = 24
  const rows: string[] = []
  const innerTop = 2
  const innerBottom = H - 3
  const innerH = innerBottom - innerTop + 1
  const level = left === null ? 0 : Math.round((left / 100) * innerH)
  const liquidTop = innerBottom - level + 1
  const low = left !== null && left < 20
  for (let j = 0; j < H; j++) {
    let row = ''
    for (let i = 0; i < W; i++) {
      // a slight taper: the glass narrows by one pixel each side over the lower half
      const inset = j > H / 2 ? 1 : 0
      const l = inset
      const r = W - 1 - inset
      if (i < l || i > r) {
        row += '.'
        continue
      }
      if (j === H - 1 || j === H - 2) {
        row += i === l || i === r ? 'g' : 'G' // the heavy base
        continue
      }
      if (i === l || i === r) {
        row += 'g'
        continue
      }
      if (j < innerTop) {
        row += '.'
        continue
      }
      if (left !== null && level > 0 && j >= liquidTop) {
        const foam = j < liquidTop + 2
        // the soju shot glass sunk in the beer: a darker block near the bottom
        const shot = j >= innerBottom - 6 && j <= innerBottom - 1 && i >= 5 && i <= 8
        if (foam) row += 'f'
        else if (shot) row += j === innerBottom - 6 ? 's' : 'S'
        else row += i === r - 1 || i === r - 2 ? (low ? 'D' : 'd') : low ? 'L' : 'b'
      } else {
        row += i === l + 1 ? 'h' : 'e' // empty glass with a highlight
      }
    }
    rows.push(row)
  }
  const palette = {
    g: '#cfe6f5',
    G: '#a9c7dc',
    h: '#ffffff33',
    e: '#ffffff14',
    f: '#fff8e7',
    b: '#f2b630',
    d: '#d9961c',
    L: '#e8673a',
    D: '#c24a24',
    s: '#e8fff0',
    S: '#f6d77a',
  }
  let out = sprite(rows, palette, x, y)
  // bubbles rising through the beer
  if (left !== null && level > 4) {
    const top = y + (liquidTop + 2) * PX
    const bottom = y + (innerBottom - 1) * PX
    for (const [i, delay] of [[3, 0], [9, 0.9], [6, 1.7]] as const) {
      out += `<rect class="bub" style="animation-delay:${delay}s;--rise:${top - bottom}px" x="${x + i * PX}" y="${bottom}" width="${PX}" height="${PX}" fill="#fff6d8"/>`
    }
  }
  return out
}

// The soju bottle: 8 x 24 pixels, green glass, what is left inside.
const bottle = (left: number | null, x: number, y: number): string => {
  const shape = [
    '..cccc..',
    '..cccc..',
    '...nn...',
    '...nn...',
    '...nn...',
    '..nnnn..',
    '.nnnnnn.',
    'nnnnnnnn',
    ...Array.from({ length: 15 }, () => 'nnnnnnnn'),
    '.nnnnnn.',
  ]
  const body0 = 8
  const bodyH = shape.length - body0 - 1
  const level = left === null ? 0 : Math.round((left / 100) * bodyH)
  const rows = shape.map((row, j) =>
    [...row]
      .map((c, i) => {
        if (c !== 'n') return c
        if (i === 0 || i === 7 || j < body0 || j === shape.length - 1) return 'n'
        if (j >= 11 && j <= 14) return 'w' // the label
        if (j > shape.length - 2 - level) return i === 6 ? 'q' : 'l'
        return i === 1 ? 'h' : 'k'
      })
      .join(''),
  )
  return sprite(rows, { c: '#2e9e4f', n: '#2a8a4a', w: '#eef7f0', l: '#a9f0c2', q: '#7fd9a0', k: '#1f5a36', h: '#3fb86a' }, x, y)
}

// The fishcake skewer: one piece per fifth of the context window still free.
const skewer = (filled: number | null, x: number, y: number): string => {
  const pieces = filled === null ? 5 : Math.max(0, Math.ceil((100 - clamp(filled)) / 20))
  let out = `<rect x="${x + 4 * PX}" y="${y}" width="${PX}" height="${24 * PX}" fill="#c9a06a"/>`
  const piece = ['.oooooo.', 'oOOOOOOo', 'oOOOOOOo', '.oooooo.']
  for (let p = 0; p < 5; p++) {
    const isLeft = p >= 5 - pieces
    out += sprite(piece, isLeft ? { o: '#e0a35a', O: '#f6c987' } : { o: '#ffffff10', O: '#ffffff08' }, x, y + 2 * PX + p * 4.4 * PX)
  }
  return out
}

export const offHoursOf = (now: number, offset: number | null): 'overtime' | 'weekend' | null => {
  if (offset === null) return null
  const local = new Date(now + offset * 60000)
  const day = local.getUTCDay()
  const hour = local.getUTCHours()
  if (day === 0 || day === 6) return 'weekend'
  return hour >= 18 || hour < 6 ? 'overtime' : null
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const ciLabel = (git: Git | null): { label: string; color: string } => {
  if (git === null) return { label: '', color: '#9d96b8' }
  if (git.pr === null) return { label: 'PR 없음', color: '#9d96b8' }
  if (git.ci === 'pass') return { label: `PR #${git.pr} · CI 통과`, color: '#55e0b0' }
  if (git.ci === 'fail') return { label: `PR #${git.pr} · CI 실패`, color: '#ff5468' }
  if (git.ci === 'pending') return { label: `PR #${git.pr} · CI 도는 중`, color: '#ffcf4a' }
  return { label: `PR #${git.pr}`, color: '#c9a2ff' }
}

export const bandSvg = ({ meter, work, git, activity, isWorking, now }: BandFigures): string => {
  const five = meter?.fiveHour ?? null
  const week = meter?.week ?? null
  const fiveLeft = five === null ? null : clamp(100 - five)
  const weekLeft = week === null ? null : clamp(100 - week)
  const ctx = meter?.context ?? null
  const W = 790
  const H = 112
  const R = W - 16 // right edge of the workday column
  const text = (x: number, y: number, size: number, fill: string, s: string, anchor = 'start') =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" ${FONT}>${s}</text>`
  const pct = (n: number | null) => (n === null ? '--' : `${Math.round(n)}%`)
  const fiveColor = fiveLeft === null ? '#9d96b8' : fiveLeft < 20 ? '#ff5468' : '#ffcf4a'
  const fiveNote =
    fiveLeft === null ? '측정 대기 중' : fiveLeft <= 0 ? '다 마셨다!' : fiveLeft < 20 ? '거의 다 마셨어…' : (untilReset(meter?.fiveResetsAt ?? null, now) ?? '')
  const weekNote = weekLeft === null ? '측정 대기 중' : (untilReset(meter?.weekResetsAt ?? null, now) ?? '')
  const worked = work === null ? null : Math.max(0, Math.floor((now - work.startedAt) / 60000))
  const day = workday(now, work?.utcOffsetMin ?? null)
  const branch = git?.branch ?? null
  const shortBranch = branch === null ? '' : branch.length > 18 ? `${branch.slice(0, 17)}…` : branch
  const ci = ciLabel(git)
  const gitLine =
    git === null
      ? ''
      : `<text x="${R}" y="76" font-size="11" text-anchor="end" ${FONT}>` +
        `<tspan fill="#c9a2ff">git ${esc(shortBranch)}</tspan>` +
        (git.dirty > 0 ? `<tspan fill="#ffcf4a"> ●${git.dirty}</tspan>` : '') +
        (git.ahead > 0 ? `<tspan fill="#5ff3ff"> ↑${git.ahead}</tspan>` : '') +
        `</text>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges">
<style>
.bub{animation:rise 2.4s steps(8) infinite}
@keyframes rise{from{transform:translateY(0);opacity:1}to{transform:translateY(var(--rise));opacity:0}}
.blink{animation:bl 1.2s steps(1) infinite}
@keyframes bl{50%{opacity:.25}}
${CRITTER_CSS}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}
</style>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="6" fill="#0b0b1d" stroke="#3a2a5c" stroke-width="2"/>
<rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="3" fill="none" stroke="#ff5fa8" stroke-opacity=".35" stroke-dasharray="8 6"/>
${critterSvg({ activity, isWorking, fiveLeft, ci: git?.ci ?? null, offHours: offHoursOf(now, work?.utcOffsetMin ?? null), now }, 14, 38)}
${text(46, 100, 10, '#c9a2ff', '주인님', 'middle')}
${glass(fiveLeft, 96, 10)}
${text(160, 28, 11, '#c6c0da', '소맥 · 5시간')}
${text(160, 58, 26, fiveColor, pct(fiveLeft))}
${text(160, 74, 11, '#c6c0da', '남음')}
${text(160, 94, 11, fiveLeft !== null && fiveLeft < 20 ? '#ff5468' : '#9d96b8', fiveNote)}
${bottle(weekLeft, 300, 10)}
${text(344, 28, 11, '#c6c0da', '소주 · 이번 주')}
${text(344, 58, 26, weekLeft !== null && weekLeft < 20 ? '#ff5468' : '#7dffb0', pct(weekLeft))}
${text(344, 74, 11, '#c6c0da', '남음')}
${text(344, 94, 11, '#9d96b8', weekNote)}
${skewer(ctx, 470, 10)}
${text(514, 28, 11, '#c6c0da', '어묵 · 대화')}
${text(514, 58, 26, '#f6c987', pct(ctx === null ? null : 100 - clamp(ctx)))}
${text(514, 74, 11, '#c6c0da', '남음')}
<line x1="604" y1="16" x2="604" y2="${H - 16}" stroke="#3a2a5c" stroke-width="2"/>
${text(R, 30, 11, '#c6c0da', worked === null ? '' : `근무 ${hm(worked)} · 턴 ${work?.turns ?? 0}`, 'end')}
${text(R, 54, 18, day.color, day.label, 'end')}
${gitLine}
${text(R, 94, 11, ci.color, ci.label, 'end')}
<rect class="blink" x="614" y="46" width="${PX}" height="${PX}" fill="${day.color}"/>
</svg>`
}

export const bandText = ({ meter, work, git, now }: BandFigures): string => {
  const left = (n: number | null | undefined) => (n === null || n === undefined ? '--' : `${Math.round(clamp(100 - n))}%`)
  const parts = [`소맥 ${left(meter?.fiveHour)}`, `소주 ${left(meter?.week)}`, `어묵 ${left(meter?.context)}`, workday(now, work?.utcOffsetMin ?? null).label]
  if (git?.branch) parts.push(`git ${git.branch}`)
  const ci = ciLabel(git).label
  if (ci !== '') parts.push(ci)
  return parts.join(' · ')
}
