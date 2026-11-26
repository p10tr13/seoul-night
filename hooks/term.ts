// The band above the prompt for the terminal: a small somaek glass, soju bottle, fishcake skewer
// and critter, three rows high, drawn as pixel art in half blocks (two pixels per cell, one above
// the other), with the words beside them left to the terminal's own text.
// Pure: it takes the figures and returns cell grids and lines.

import { CRITTER_INK, CRITTER_PALETTE, critterState, critterTags } from './critter'
import type { CritterState } from './critter'
import { ciLabel, clamp, hm, offHoursOf, untilReset, workday } from './meter'
import type { BandFigures } from './meter'

/** Pixel rows of every sprite: three terminal rows. */
export const PIXEL_ROWS = 6

/** A sprite as colors, row-major; null is transparent. */
type Pixels = (string | null)[][]

const paint = (rows: string[], palette: Record<string, string>): Pixels =>
  rows.map(row => [...row].map(c => palette[c] ?? null))

const RED = '#ff5468'

// The somaek glass, 5 x 6: four rows inside, filled from the bottom with what is left of the
// 5-hour window, foam on top; a stem and a foot below.
export const glassPixels = (left: number | null): Pixels => {
  const level = left === null ? 0 : Math.round((left / 100) * 4)
  const low = left !== null && left < 20
  const rows: string[] = []
  for (let j = 0; j < 4; j++) {
    const fill = 4 - j
    rows.push(fill > level ? 'gheeg' : fill === level ? 'gfffg' : 'gbbdg')
  }
  rows.push(level > 0 ? '.gbg.' : '.geg.', '.GGG.')
  return paint(rows, {
    g: '#cfe6f5',
    G: '#a9c7dc',
    e: '#1d1d3b',
    h: '#3a3f5c',
    f: '#fff8e7',
    b: low ? '#e8673a' : '#f2b630',
    d: low ? '#c24a24' : '#d9961c',
  })
}

// The soju bottle, 4 x 6: a cap, a neck, three rows inside holding what is left of the week, a base.
export const bottlePixels = (left: number | null): Pixels => {
  const level = left === null ? 0 : Math.round((left / 100) * 3)
  const body = [0, 1, 2].map(j => (3 - j <= level ? 'nlqn' : 'nkkn'))
  const liquid = left !== null && left < 20 ? RED : '#a9f0c2'
  return paint(['.cc.', '.nn.', ...body, 'nnnn'], { c: '#2e9e4f', n: '#2a8a4a', l: liquid, q: '#7fd9a0', k: '#1f5a36' })
}

// The fishcake skewer, 3 x 6: the stick's tip, then five pieces, one per fifth of the context
// window still free, eaten from the top. The pieces take turns in two shades so they read apart.
export const skewerPixels = (filled: number | null): Pixels => {
  const pieces = filled === null ? 5 : Math.max(0, Math.ceil((100 - clamp(filled)) / 20))
  const rows = ['.s.']
  for (let p = 0; p < 5; p++) rows.push(p >= 5 - pieces ? (p % 2 === 0 ? 'OOO' : 'ooo') : '.s.')
  return paint(rows, { s: '#c9a06a', O: '#f6c987', o: '#d98f46' })
}

/** The critter's canvas: its body with a pixel to spare each side, and its props to the right. */
export const CRITTER_W = 14
/** How often the critter moves a frame. */
export const FRAME_MS = 250

/** What the critter acts out: its state, and the hour for its coffee. */
export type CritterScene = { state: CritterState; offHours: 'overtime' | 'weekend' | null }

// The body, 8 x 5, one row short of the canvas so it can bob; its eyes go at (1, 1) and (6, 1).
const body = (state: CritterState): string[] => {
  const cheek = state === 'tipsy' || state === 'ci-fail' ? 'R' : 'p'
  return ['.oooooo.', 'oooooooo', `a${cheek}oooo${cheek}a`, '.oooooo.', '.l....l.']
}
const EYE_CELLS: [number, number][] = [[1, 1], [6, 1]]
const LID = '#c96a4b'

const eyeColor = (state: CritterState, t: number): string => {
  switch (state) {
    case 'sleep':
      return LID
    case 'done':
    case 'ci-pass':
      return '#ff5fa8'
    case 'error':
    case 'ci-fail':
    case 'long':
      return '#ffffff'
    case 'read':
      return '#c9e7ff'
    case 'idle':
    case 'coffee':
    case 'thinking':
      // a blink now and then
      return t % 20 === 19 ? LID : CRITTER_INK
    default:
      return CRITTER_INK
  }
}

const blank = (w: number, h: number): Pixels => Array.from({ length: h }, () => Array<string | null>(w).fill(null))

// Paints a sprite onto the canvas at (x, y), clipped to its edges.
const stamp = (canvas: Pixels, rows: readonly string[], palette: Record<string, string>, x: number, y: number) => {
  rows.forEach((row, j) => {
    const line = canvas[y + j]
    if (line === undefined) return
    ;[...row].forEach((c, i) => {
      const color = palette[c]
      if (color !== undefined && x + i >= 0 && x + i < line.length) line[x + i] = color
    })
  })
}

// How the body moves at this frame: a step up (0 or 1) and a step aside (-1 to 1).
const motion = (state: CritterState, t: number): { dy: number; dx: number } => {
  const slow = (period: number) => Math.floor(t / period) % 2
  switch (state) {
    case 'bash':
    case 'long':
      return { dy: t % 2, dx: 0 }
    case 'edit':
      return { dy: slow(2), dx: 0 }
    case 'web':
      return { dy: slow(3), dx: 0 }
    case 'thinking':
      return { dy: 0, dx: [0, 1, 0, -1][Math.floor(t / 3) % 4] ?? 0 }
    case 'tipsy':
      return { dy: 0, dx: [-1, 0, 1, 0][Math.floor(t / 2) % 4] ?? 0 }
    case 'done':
      return { dy: t % 3 === 0 ? 0 : 1, dx: 0 }
    case 'ci-pass':
      return { dy: t % 2, dx: t % 2 === 0 ? -1 : 1 }
    case 'error':
    case 'ci-fail':
      return { dy: 0, dx: t % 2 === 0 ? -1 : 1 }
    case 'sleep':
      return { dy: slow(12), dx: 0 }
    case 'coffee':
      return { dy: slow(10), dx: 0 }
    default:
      return { dy: slow(8), dx: 0 }
  }
}

const HEART = ['h.h', '.h.']
const DRIP = { b: '#7fd8ff' }

// What the critter holds or what floats beside it, at this frame: at most 3 x 6 pixels.
const props = (canvas: Pixels, scene: CritterScene, t: number) => {
  const P = 11 // the props' column
  switch (scene.state) {
    case 'thinking': {
      const dots = Math.floor(t / 2) % 4
      stamp(canvas, ['ddd'.slice(0, dots)], { d: '#c9a2ff' }, P, 0)
      return
    }
    case 'bash':
      stamp(canvas, ['kkk', t % 2 === 0 ? 'kKk' : 'KkK'], { k: '#2b2f45', K: '#5ff3ff' }, P, 4)
      return
    case 'edit':
      stamp(canvas, ['..Y', '.Y.', 'P..'], { Y: '#ffd23f', P: '#ff9ee0' }, P, 3)
      if (Math.floor(t / 2) % 2 === 0) stamp(canvas, ['..w'], { w: '#ffffff' }, P, 1)
      return
    case 'web': {
      const on = Math.floor(t / 2) % 2 === 0
      stamp(canvas, ['ddd', on ? 'dSd' : 'dsd', 'ddd'], { d: '#2b2f45', S: '#5ff3ff', s: '#2a7f99' }, P, 3)
      return
    }
    case 'done':
      stamp(canvas, HEART, { h: '#ff5fa8' }, P, 4 - (t % 6))
      return
    case 'ci-pass':
      stamp(canvas, HEART, { h: t % 4 < 2 ? '#ff9ee0' : '#ff5fa8' }, P, 4 - (t % 6))
      return
    case 'error':
    case 'ci-fail':
      stamp(canvas, ['b'], DRIP, P, t % 6)
      return
    case 'long':
      stamp(canvas, ['b'], DRIP, P, t % 6)
      stamp(canvas, ['b'], DRIP, P + 2, (t + 3) % 6)
      return
    case 'tipsy':
      if (Math.floor(t / 4) % 3 === 0) stamp(canvas, ['.o.', 'o.o', '.o.'], { o: '#ff9ee0' }, P, 0)
      return
    case 'sleep':
      stamp(canvas, ['ZZZ', '.Z.', 'ZZZ'], { Z: '#c9a2ff' }, P, 2 - (Math.floor(t / 3) % 3))
      return
    case 'coffee': {
      stamp(canvas, ['s'], { s: '#c6c0da' }, P + (Math.floor(t / 4) % 2), 2)
      stamp(canvas, ['cc.', 'ccC'], { c: scene.offHours === 'weekend' ? '#ff9ee0' : '#f4efe0', C: '#c6c0da' }, P, 4)
      return
    }
    default:
      return
  }
}

/** The critter at frame `t` (counted in FRAME_MS): its body moving by its state, its eyes, its props. */
export const critterFrame = (scene: CritterScene, t: number): Pixels => {
  const { state } = scene
  const canvas = blank(CRITTER_W, PIXEL_ROWS)
  const { dy, dx } = motion(state, t)
  const bx = 1 + dx
  const by = 1 - dy
  stamp(canvas, body(state), CRITTER_PALETTE, bx, by)
  const eye = eyeColor(state, t)
  for (const [i, j] of EYE_CELLS) {
    const line = canvas[by + j]
    if (line !== undefined) line[bx + i] = eye
  }
  props(canvas, scene, t)
  return canvas
}

/** The critter standing still, as the first frame. */
export const critterPixels = (state: CritterState): Pixels => critterFrame({ state, offHours: null }, 0)

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
  /** The critter, and its line beside it in a column as wide as the state's longer line. */
  critter: { scene: CritterScene; tag: string; tagColumns: number }
  meters: { key: 'glass' | 'bottle' | 'skewer'; cells: ReturnType<typeof toCells>; textColumns: number; lines: Line[] }[]
  /** The workday's three lines, each in one or more pieces of its own color. */
  day: Line[][]
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

/** How wide a line of pieces is, with a space between pieces. */
export const piecesWidth = (pieces: readonly Line[]): number => {
  const shown = pieces.filter(p => p.text !== '')
  return shown.reduce((n, p) => n + textWidth(p.text), 0) + Math.max(0, shown.length - 1)
}

/** Between the band's columns, and the padding on both sides. */
export const GAP = 2
const FRAME = 2

/** What the band shows in `columns`: the pixels or one line of text, the critter's line, the workday beside. */
export type TermBandLayout = { pixels: boolean; tag: boolean; dayBeside: boolean }

/**
 * What fits, by what the band says now. The pixels need only the critter and the three gauges, so
 * they never give way to the critter's line, which changes with each state (a long idle line or
 * 사랑해요 ♥ after a turn): the line shows when there is room for it. The workday stands in a
 * column after the skewer when it fits, else on a line under the pixels. Below the pixels' width,
 * one line of text.
 */
export const termBandLayout = (band: TermBand, columns: number): TermBandLayout => {
  const meters = band.meters.reduce((sum, m) => sum + GAP + m.cells.columns + 1 + m.textColumns, 0)
  const base = FRAME + CRITTER_W + meters
  if (columns < base) return { pixels: false, tag: false, dayBeside: false }
  const withTag = base + 1 + band.critter.tagColumns
  const tag = columns >= withTag
  const day = GAP + Math.max(0, ...band.day.map(piecesWidth))
  return { pixels: true, tag, dayBeside: columns >= (tag ? withTag : base) + day }
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
    critter: {
      scene: { state, offHours: inputs.offHours },
      tag: phase % 2 === 0 ? tagA : tagB,
      tagColumns: Math.max(textWidth(tagA), textWidth(tagB)),
    },
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
      [{ text: day.label, bold: true, color: day.color }],
      [{ text: worked === null ? '' : `근무 ${hm(worked)} · 턴 ${work?.turns ?? 0}`, dim: true }],
      [
        { text: gitLine, color: '#c9a2ff' },
        { text: ci.label, color: ci.color },
      ],
    ],
  }
}
