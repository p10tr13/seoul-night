// The band above the prompt for the terminal: the same somaek glass, soju bottle, fishcake
// skewer and critter as the desktop's SVG, drawn as pixel art in half blocks (two pixels per
// cell, one above the other), with the words beside them left to the terminal's own text.
// Pure: it takes the figures and returns cell grids and lines.

import { CRITTER_INK, CRITTER_PALETTE, critterBody, critterState, critterTags } from './critter'
import type { CritterState } from './critter'
import { ciLabel, clamp, hm, offHoursOf, untilReset, workday } from './meter'
import type { BandFigures } from './meter'

/** Pixel rows of every sprite: six terminal rows. */
export const PIXEL_ROWS = 12

/** A sprite as colors, row-major; null is transparent. */
type Pixels = (string | null)[][]

const paint = (rows: string[], palette: Record<string, string>): Pixels =>
  rows.map(row => [...row].map(c => palette[c] ?? null))

// Pads a sprite at the top to the band's height, so every sprite stands on the same floor.
const floor = (pixels: Pixels, width: number): Pixels => {
  const pad = Array.from({ length: Math.max(0, PIXEL_ROWS - pixels.length) }, () => Array<string | null>(width).fill(null))
  return [...pad, ...pixels]
}

// The somaek glass, 8 x 12: filled from the bottom with what is left of the 5-hour window.
export const glassPixels = (left: number | null): Pixels => {
  const W = 8
  const H = 12
  const innerTop = 1
  const innerBottom = H - 3
  const innerH = innerBottom - innerTop + 1
  const level = left === null ? 0 : Math.round((left / 100) * innerH)
  const liquidTop = innerBottom - level + 1
  const low = left !== null && left < 20
  const rows: string[] = []
  for (let j = 0; j < H; j++) {
    const inset = j > H / 2 ? 1 : 0
    const l = inset
    const r = W - 1 - inset
    let row = ''
    for (let i = 0; i < W; i++) {
      if (i < l || i > r) row += '.'
      else if (j >= H - 2) row += i === l || i === r ? 'g' : 'G'
      else if (i === l || i === r) row += 'g'
      else if (j < innerTop) row += '.'
      else if (level > 0 && j >= liquidTop) {
        const shot = j >= innerBottom - 2 && i >= 3 && i <= 4
        if (j === liquidTop) row += 'f'
        else if (shot) row += j === innerBottom - 2 ? 's' : 'S'
        else row += i === r - 1 ? (low ? 'D' : 'd') : low ? 'L' : 'b'
      } else row += i === l + 1 ? 'h' : 'e'
    }
    rows.push(row)
  }
  return paint(rows, {
    g: '#cfe6f5',
    G: '#a9c7dc',
    h: '#3a3f5c',
    e: '#1d1d3b',
    f: '#fff8e7',
    b: '#f2b630',
    d: '#d9961c',
    L: '#e8673a',
    D: '#c24a24',
    s: '#e8fff0',
    S: '#f6d77a',
  })
}

// The soju bottle, 4 x 12: green glass, a white label, what is left of the week inside.
export const bottlePixels = (left: number | null): Pixels => {
  const shape = ['.cc.', '.nn.', '.nn.', 'nnnn', 'nnnn', 'nnnn', 'nnnn', 'nnnn', 'nnnn', 'nnnn', 'nnnn', '.nn.']
  const body0 = 4
  const bodyH = shape.length - body0 - 1
  const level = left === null ? 0 : Math.round((left / 100) * bodyH)
  const rows = shape.map((row, j) =>
    [...row]
      .map((c, i) => {
        if (c !== 'n') return c
        if (i === 0 || i === 3 || j < body0 || j === shape.length - 1) return 'n'
        if (j === 6) return 'w'
        if (j > shape.length - 2 - level) return i === 2 ? 'q' : 'l'
        return i === 1 ? 'h' : 'k'
      })
      .join(''),
  )
  return paint(rows, { c: '#2e9e4f', n: '#2a8a4a', w: '#eef7f0', l: '#a9f0c2', q: '#7fd9a0', k: '#1f5a36', h: '#3fb86a' })
}

// The fishcake skewer, 5 x 12: one piece per fifth of the context window still free.
export const skewerPixels = (filled: number | null): Pixels => {
  const pieces = filled === null ? 5 : Math.max(0, Math.ceil((100 - clamp(filled)) / 20))
  const rows = ['..s..']
  for (let p = 0; p < 5; p++) {
    const isLeft = p >= 5 - pieces
    rows.push(isLeft ? 'OOOOO' : 'xxsxx', isLeft ? 'ooooo' : 'xxsxx')
  }
  rows.push('..s..')
  return paint(rows, { s: '#c9a06a', O: '#f6c987', o: '#e0a35a', x: '#1d1d3b' })
}

// The critter's eyes, in its body's cells, as the SVG draws them.
const EYES: Partial<Record<CritterState, [number, number][]>> = {
  done: [[3, 4], [4, 3], [5, 4], [10, 4], [11, 3], [12, 4]],
  'ci-pass': [[3, 4], [4, 3], [5, 4], [10, 4], [11, 3], [12, 4]],
  sleep: [[3, 4], [4, 4], [5, 4], [10, 4], [11, 4], [12, 4]],
  tipsy: [[4, 4], [5, 4], [10, 4], [11, 4]],
  error: [[4, 3], [5, 3], [4, 4], [5, 4], [10, 3], [11, 3], [10, 4], [11, 4]],
  'ci-fail': [[4, 3], [5, 3], [4, 4], [5, 4], [10, 3], [11, 3], [10, 4], [11, 4]],
  long: [[4, 3], [5, 3], [4, 4], [5, 4], [10, 3], [11, 3], [10, 4], [11, 4]],
}
const OPEN_EYES: [number, number][] = [[4, 3], [4, 4], [11, 3], [11, 4]]
const SHUT_EYES: [number, number][] = [[3, 4], [4, 4], [5, 4], [10, 4], [11, 4], [12, 4]]

// The critter, 16 x 12: its body and eyes, the eyes shut for a blink when `isBlinking`.
export const critterPixels = (state: CritterState, isBlinking: boolean): Pixels => {
  const pixels = floor(paint(critterBody(state), CRITTER_PALETTE), 16)
  const top = PIXEL_ROWS - 11
  const eyes = EYES[state] ?? (isBlinking ? SHUT_EYES : OPEN_EYES)
  for (const [i, j] of eyes) {
    const row = pixels[top + j]
    if (row !== undefined) row[i] = CRITTER_INK
  }
  // the bright spot in a wide-eyed look
  if (state === 'error' || state === 'ci-fail' || state === 'long') {
    for (const [i, j] of [[4, 3], [10, 3]] as const) {
      const row = pixels[top + j]
      if (row !== undefined) row[i] = '#ffffff'
    }
  }
  return pixels
}

const DEFAULT = 0x01000000
const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄

const rgb = (hex: string | null): number => (hex === null ? DEFAULT : Number.parseInt(hex.slice(1, 7), 16))

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const base64 = (bytes: Uint8Array): string => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += b === undefined ? '=' : B64[(n >> 6) & 63]!
    out += c === undefined ? '=' : B64[n & 63]!
  }
  return out
}

/** A Raster's size and `cells`: each cell the pixel above as the half block's color, the pixel below as its ground. */
export const toCells = (pixels: Pixels): { columns: number; rows: number; cells: string } => {
  const columns = Math.max(0, ...pixels.map(r => r.length))
  const rows = Math.ceil(pixels.length / 2)
  const words = new Uint32Array(columns * rows * 3)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const top = pixels[y * 2]?.[x] ?? null
      const bottom = pixels[y * 2 + 1]?.[x] ?? null
      const k = (y * columns + x) * 3
      if (top === null && bottom === null) {
        words.set([0x20, DEFAULT, DEFAULT], k)
      } else if (top === null) {
        words.set([LOWER, rgb(bottom), DEFAULT], k)
      } else {
        words.set([UPPER, rgb(top), rgb(bottom)], k)
      }
    }
  }
  return { columns, rows, cells: base64(new Uint8Array(words.buffer)) }
}

/** A line of the band's words, in a color of the theme's or its own. */
export type Line = { text: string; color?: string; dim?: boolean; bold?: boolean }

export type TermBand = {
  critter: { cells: ReturnType<typeof toCells>; tag: string }
  meters: { key: 'glass' | 'bottle' | 'skewer'; cells: ReturnType<typeof toCells>; textColumns: number; lines: Line[] }[]
  day: Line[]
}

/** How many terminal columns a text takes: Hangul and other wide letters take two. */
export const textWidth = (text: string): number => {
  let n = 0
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6)
    n += wide ? 2 : 1
  }
  return n
}

const widest = (lines: readonly Line[]) => Math.max(0, ...lines.map(l => textWidth(l.text)))

/** The critter's column: its body, and room for its longest line. */
export const CRITTER_COLUMNS = 16
/** Between the band's columns, and the frame's border and padding on both sides. */
export const GAP = 2
const FRAME = 4

/**
 * The columns the band needs, by what it says now: from `full` the workday stands in a column
 * after the skewer; from `compact` it goes on a line under the pixels; below that, one line of text.
 */
export const termBandColumns = (band: TermBand): { full: number; compact: number } => {
  const meters = band.meters.reduce((sum, m) => sum + m.cells.columns + 1 + m.textColumns + GAP, 0)
  const compact = FRAME + CRITTER_COLUMNS + meters
  return { compact, full: compact + GAP + widest(band.day) }
}

/** The band for the terminal; `phase` flips each few seconds (the tag's turn, a blink). */
export const termBand = ({ meter, work, git, activity, isWorking, now }: BandFigures, phase: number): TermBand => {
  const five = meter?.fiveHour ?? null
  const week = meter?.week ?? null
  const fiveLeft = five === null ? null : clamp(100 - five)
  const weekLeft = week === null ? null : clamp(100 - week)
  const ctx = meter?.context ?? null
  const pct = (n: number | null) => (n === null ? '--' : `${Math.round(n)}%`)

  const inputs = { activity, isWorking, fiveLeft, ci: git?.ci ?? null, offHours: offHoursOf(now, work?.utcOffsetMin ?? null), now }
  const state = critterState(inputs)
  const [tagA, tagB] = critterTags(state, inputs)

  const fiveNote =
    fiveLeft === null ? '측정 대기 중' : fiveLeft <= 0 ? '다 마셨다!' : fiveLeft < 20 ? '거의 다 마셨어…' : (untilReset(meter?.fiveResetsAt ?? null, now) ?? '')
  const weekNote = weekLeft === null ? '측정 대기 중' : (untilReset(meter?.weekResetsAt ?? null, now) ?? '')

  const worked = work === null ? null : Math.max(0, Math.floor((now - work.startedAt) / 60000))
  const day = workday(now, work?.utcOffsetMin ?? null)
  const branch = git?.branch ?? null
  const shortBranch = branch === null ? '' : branch.length > 22 ? `${branch.slice(0, 21)}…` : branch
  const ci = ciLabel(git)
  const gitLine =
    git === null ? '' : `git ${shortBranch}${git.dirty > 0 ? ` ●${git.dirty}` : ''}${git.ahead > 0 ? ` ↑${git.ahead}` : ''}`

  const gauge = (key: 'glass' | 'bottle' | 'skewer', cells: ReturnType<typeof toCells>, lines: Line[]) => ({
    key,
    cells,
    textColumns: widest(lines),
    lines,
  })

  return {
    critter: { cells: toCells(critterPixels(state, false)), tag: phase % 2 === 0 ? tagA : tagB },
    meters: [
      gauge('glass', toCells(glassPixels(fiveLeft)), [
          { text: '소맥 · 5시간', dim: true },
          { text: `${pct(fiveLeft)} 남음`, bold: true, color: fiveLeft === null ? '#9d96b8' : fiveLeft < 20 ? '#ff5468' : '#ffcf4a' },
          { text: fiveNote, color: fiveLeft !== null && fiveLeft < 20 ? '#ff5468' : '#9d96b8' },
      ]),
      gauge('bottle', toCells(bottlePixels(weekLeft)), [
          { text: '소주 · 이번 주', dim: true },
          { text: `${pct(weekLeft)} 남음`, bold: true, color: weekLeft !== null && weekLeft < 20 ? '#ff5468' : '#7dffb0' },
          { text: weekNote, color: '#9d96b8' },
      ]),
      gauge('skewer', toCells(skewerPixels(ctx)), [
          { text: '어묵 · 대화', dim: true },
          { text: `${pct(ctx === null ? null : 100 - clamp(ctx))} 남음`, bold: true, color: '#f6c987' },
      ]),
    ],
    day: [
      { text: worked === null ? '' : `근무 ${hm(worked)} · 턴 ${work?.turns ?? 0}`, dim: true },
      { text: day.label, bold: true, color: day.color },
      { text: gitLine, color: '#c9a2ff' },
      { text: ci.label, color: ci.color },
    ],
  }
}
