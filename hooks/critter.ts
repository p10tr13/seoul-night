// The band's pixel critter: what it does follows the session (thinking, the tool at work, a turn
// that ended, an error, the limits, CI, the hour), each state with a short Korean line above it.
// Pure: it takes the figures and returns markup.

import type { CiState } from '../types'

import type { Activity, ActivityKind } from '../types'

export type { Activity, ActivityKind }

export type CritterState =
  | 'idle'
  | 'thinking'
  | 'bash'
  | 'edit'
  | 'read'
  | 'web'
  | 'done'
  | 'error'
  | 'ci-pass'
  | 'ci-fail'
  | 'long'
  | 'tipsy'
  | 'sleep'
  | 'coffee'

export type CritterInputs = {
  activity: Activity | null
  isWorking: boolean
  /** Percent left of the 5-hour window. */
  fiveLeft: number | null
  ci: CiState | null
  /** After hours or on the weekend, by the machine's clock. */
  offHours: 'overtime' | 'weekend' | null
  now: number
}

/** How long a passing state shows before the critter settles again. */
export const TRANSIENT_MS = { done: 15000, error: 7000, 'ci-pass': 15000 } as const
const LONG_TURN_MS = 120_000

export const critterState = (c: CritterInputs): CritterState => {
  if (c.fiveLeft !== null && c.fiveLeft <= 0) return 'sleep'
  const a = c.activity
  if (a !== null && (a.kind === 'done' || a.kind === 'error' || a.kind === 'ci-pass') && c.now - a.since < TRANSIENT_MS[a.kind]) {
    return a.kind
  }
  if (c.isWorking) {
    if (a?.turnStartedAt != null && c.now - a.turnStartedAt > LONG_TURN_MS) return 'long'
    if (a !== null && (a.kind === 'bash' || a.kind === 'edit' || a.kind === 'read' || a.kind === 'web')) return a.kind
    return 'thinking'
  }
  if (c.ci === 'fail') return 'ci-fail'
  if (c.fiveLeft !== null && c.fiveLeft < 20) return 'tipsy'
  if (c.offHours !== null) return 'coffee'
  return 'idle'
}

// How long each of a state's two lines stays up before the other takes its turn.
const TAG_SECONDS = 8

const FONT = `font-family="'Galmuri11','DungGeunMo','Malgun Gothic','Apple SD Gothic Neo',monospace"`

const sprite = (rows: string[], palette: Record<string, string>, x: number, y: number, px: number): string => {
  let out = ''
  rows.forEach((row, j) => {
    let i = 0
    while (i < row.length) {
      const c = row[i] ?? '.'
      let n = 1
      while (row[i + n] === c) n++
      const fill = palette[c]
      if (c !== '.' && fill !== undefined) {
        out += `<rect x="${x + i * px}" y="${y + j * px}" width="${n * px}" height="${px}" fill="${fill}"/>`
      }
      i += n
    }
  })
  return out
}

// Two frames that take turns: the first is the one left showing when animation stops.
const frames = (a: string, b: string, seconds = 1) =>
  `<g class="fa" style="animation-duration:${seconds}s">${a}</g><g class="fb" style="animation-duration:${seconds}s">${b}</g>`

const BODY = { o: '#d97757', a: '#c96a4b', l: '#b85c3c', p: '#ff9a8f', R: '#ff3355' }
const INK = '#1d1420'

const TAGS: Record<CritterState, [string, string]> = {
  idle: ['ㅎㅎ', 'ㅎㅎ'],
  thinking: ['음…', '흠…'],
  bash: ['타닥', '타닥타닥'],
  edit: ['슥슥', '슥슥슥'],
  read: ['어디 보자~', '흠흠'],
  web: ['검색 중', '네이버~'],
  done: ['대박!', '사랑해요 ♥'],
  'ci-pass': ['칼군무 ♪', 'CI 통과!'],
  'ci-fail': ['망했다…', 'CI 빨간불!'],
  error: ['헐…', '아이고'],
  long: ['힘들다…', '야근 각…'],
  tipsy: ['딸꾹', '딸꾹!'],
  sleep: ['쿨쿨', 'zZz'],
  coffee: ['아아 수혈 중', '퇴근하고 싶다'],
}
const IDLE_TAGS = ['ㅎㅎ', '뿌잉뿌잉', '오늘도 화이팅', 'ㅇㅅㅇ', '♪ 라라라']

const MOTION: Record<CritterState, string> = {
  idle: 'class="breathe"',
  thinking: 'class="sway" style="animation-duration:2.4s"',
  bash: 'class="breathe" style="animation-duration:.3s"',
  edit: 'class="breathe" style="animation-duration:.8s"',
  read: 'class="breathe" style="animation-duration:2.2s"',
  web: 'class="breathe" style="animation-duration:1.4s"',
  done: 'class="jump"',
  'ci-pass': 'class="dance"',
  'ci-fail': 'class="shake"',
  error: 'class="shake"',
  long: 'class="breathe" style="animation-duration:.4s"',
  tipsy: 'class="sway"',
  sleep: 'class="breathe" style="animation-duration:3.2s"',
  coffee: 'class="breathe" style="animation-duration:2.6s"',
}

// Eyes over the body, in the body's 4-px cells: the eyes sit at columns 4 and 11, rows 3 and 4.
const eyes = (state: CritterState, x: number, y: number): string => {
  const P = 4
  const at = (cells: [number, number][], fill = INK) =>
    cells.map(([i, j]) => `<rect x="${x + i * P}" y="${y + j * P}" width="${P}" height="${P}" fill="${fill}"/>`).join('')
  switch (state) {
    case 'done':
    case 'ci-pass':
      return at([[3, 4], [4, 3], [5, 4], [10, 4], [11, 3], [12, 4]]) // ^ ^
    case 'sleep':
      return at([[3, 4], [4, 4], [5, 4], [10, 4], [11, 4], [12, 4]]) // - -
    case 'tipsy':
      return at([[4, 4], [5, 4], [10, 4], [11, 4]]) + at([[4, 3], [11, 3]], '#c45f43')
    case 'error':
    case 'ci-fail':
    case 'long':
      return at([[4, 3], [5, 3], [4, 4], [5, 4], [10, 3], [11, 3], [10, 4], [11, 4]]) + at([[4, 3], [10, 3]], '#ffffff')
    default:
      return `<g class="blinkE">${at([[4, 3], [4, 4], [11, 3], [11, 4]])}</g>`
  }
}

const prop = (state: CritterState, x: number, y: number, offHours: CritterInputs['offHours']): string => {
  const S = 3
  switch (state) {
    case 'bash': {
      const a = ['kkkkkkkkkkkkkkkkkk', 'kKkkKkkKkkKkkKkkKk', 'kkkkkkkkkkkkkkkkkk']
      const b = ['kkkkkkkkkkkkkkkkkk', 'kkKkkKkkKkkKkkKkkk', 'kkkkkkkkkkkkkkkkkk']
      const pal = { k: '#2b2f45', K: '#5ff3ff' }
      return frames(sprite(a, pal, x + 5, y + 36, S), sprite(b, pal, x + 5, y + 36, S), 0.3)
    }
    case 'edit':
      return (
        sprite(['....Y', '...Y.', '..Y..', '.Y...', 'P....'], { Y: '#ffd23f', P: '#ff9ee0' }, x + 62, y + 10, S) +
        frames(sprite(['.w.', 'www', '.w.'], { w: '#ffffff' }, x + 70, y + 2, S), '', 0.5)
      )
    case 'read':
      return (
        `<g fill="none" stroke="#c9e7ff" stroke-width="2"><rect x="${x + 13}" y="${y + 10}" width="14" height="12"/><rect x="${x + 41}" y="${y + 10}" width="14" height="12"/><line x1="${x + 27}" y1="${y + 14}" x2="${x + 41}" y2="${y + 14}"/></g>` +
        sprite(['.mm.', 'm..m', 'm..m', '.mm.', '...h', '....'], { m: '#c9e7ff', h: '#c9a06a' }, x + 64, y + 14, S)
      )
    case 'web':
      return frames(
        sprite(['ddd', 'dSd', 'dsd', 'dSd', 'ddd'], { d: '#2b2f45', S: '#5ff3ff', s: '#2a7f99' }, x + 64, y + 16, S),
        sprite(['ddd', 'dsd', 'dSd', 'dsd', 'ddd'], { d: '#2b2f45', S: '#5ff3ff', s: '#2a7f99' }, x + 64, y + 16, S),
        0.6,
      )
    case 'done':
      return `<g class="float">${sprite(['.h.h.', 'hhhhh', '.hhh.', '..h..'], { h: '#ff5fa8' }, x + 46, y - 8, S)}</g>`
    case 'ci-pass':
      return (
        `<g class="wave">${sprite(['.L.', 'LLL', '.L.', '.s.', '.s.', '.s.', '.s.'], { L: '#ff5fa8', s: '#c6c0da' }, x + 66, y - 4, S)}</g>` +
        `<g class="float">${sprite(['.h.h.', 'hhhhh', '.hhh.', '..h..'], { h: '#ff9ee0' }, x - 6, y - 4, S)}</g>`
      )
    case 'error':
    case 'ci-fail':
      return `<g class="drip">${sprite(['.b.', '.b.', 'bbb', 'bbb', '.b.'], { b: '#7fd8ff' }, x + 58, y, S)}</g>`
    case 'long':
      return (
        `<g class="drip">${sprite(['.b.', '.b.', 'bbb', 'bbb', '.b.'], { b: '#7fd8ff' }, x + 58, y, S)}</g>` +
        `<g class="drip" style="animation-delay:.5s">${sprite(['.b.', '.b.', 'bbb', 'bbb', '.b.'], { b: '#7fd8ff' }, x - 4, y + 4, S)}</g>`
      )
    case 'sleep':
      return `<g class="float" style="animation-duration:2.4s">${sprite(['ZZZ', '..Z', '.Z.', 'ZZZ'], { Z: '#c9a2ff' }, x + 62, y - 4, S)}</g>`
    case 'coffee':
      return (
        frames(
          sprite(['.s..', '..s.'], { s: '#c6c0da' }, x + 64, y + 14, S),
          sprite(['..s.', '.s..'], { s: '#c6c0da' }, x + 64, y + 14, S),
          1.2,
        ) + sprite(['cccc', 'cccC', 'cccc'], { c: offHours === 'weekend' ? '#ff9ee0' : '#f4efe0', C: '#c6c0da' }, x + 64, y + 20, S)
      )
    default:
      return ''
  }
}

/** The state's two lines, which take turns above the critter. */
export const critterTags = (state: CritterState, c: CritterInputs): [string, string] => {
  if (state === 'idle') {
    const tag = IDLE_TAGS[Math.floor(c.now / 600_000) % IDLE_TAGS.length] ?? TAGS.idle[0]
    return [tag, tag]
  }
  if (state === 'coffee' && c.offHours === 'weekend') return ['주말인데…', '아아 수혈 중']
  return TAGS[state]
}

/** The critter's body rows (16 x 11), cheeks by state: shared by the SVG and the terminal. */
export const critterBody = (state: CritterState): string[] => {
  const cheek = state === 'tipsy' || state === 'ci-fail' ? 'R' : 'p'
  return [
    '..oooooooooooo..',
    '.oooooooooooooo.',
    'oooooooooooooooo',
    'oooooooooooooooo',
    'oooooooooooooooo',
    'aooooooooooooooa',
    `a${cheek}${cheek}oooooooooo${cheek}${cheek}a`,
    'oooooooooooooooo',
    '.oooooooooooooo.',
    '..ll........ll..',
    '..ll........ll..',
  ]
}

export { BODY as CRITTER_PALETTE, INK as CRITTER_INK }

/** The critter at (x, y): its tag above, its body (64 x 44) and whatever it holds. */
export const critterSvg = (c: CritterInputs, x: number, y: number): string => {
  const state = critterState(c)
  const body = sprite(critterBody(state), BODY, x, y, 4)
  const [tagA, tagB] = critterTags(state, c)
  const tag = (s: string) => `<text x="${x + 32}" y="${y - 10}" font-size="11" fill="#ff9ee0" text-anchor="middle" ${FONT}>${s}</text>`
  return (
    (tagA === tagB ? tag(tagA) : frames(tag(tagA), tag(tagB), TAG_SECONDS)) +
    `<g ${MOTION[state]}>${body}${eyes(state, x, y)}${prop(state, x, y, c.offHours)}</g>`
  )
}

/** The style the critter's classes need, placed in the band's own <style>. */
export const CRITTER_CSS = `
.fa{animation:fa 1s steps(1) infinite}
.fb{opacity:0;animation:fb 1s steps(1) infinite}
@keyframes fa{50%{opacity:0}}
@keyframes fb{50%{opacity:1}}
.breathe{animation:breathe 2s steps(2) infinite}
@keyframes breathe{50%{transform:translateY(-3px)}}
.jump{animation:jump .6s steps(3) infinite}
@keyframes jump{50%{transform:translateY(-10px)}}
.shake{animation:shake .25s steps(2) infinite}
@keyframes shake{50%{transform:translateX(3px)}}
.sway,.dance,.wave{transform-box:fill-box;transform-origin:50% 100%}
.sway{animation:sway 1.6s steps(4) infinite}
@keyframes sway{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
.dance{animation:dance .5s steps(2) infinite}
@keyframes dance{0%{transform:translateX(-4px) rotate(-6deg)}50%{transform:translateX(4px) rotate(6deg)}}
.wave{animation:wave .5s steps(2) infinite}
@keyframes wave{0%{transform:rotate(-20deg)}50%{transform:rotate(20deg)}}
.blinkE{transform-box:fill-box;transform-origin:50% 50%;animation:blinkE 4s steps(1) infinite}
@keyframes blinkE{0%,93%{transform:scaleY(1)}94%,97%{transform:scaleY(.2)}}
.float{animation:float 1.5s steps(5) infinite}
@keyframes float{from{transform:translateY(0);opacity:1}to{transform:translateY(-12px);opacity:0}}
.drip{animation:drip 1s steps(4) infinite}
@keyframes drip{to{transform:translateY(10px);opacity:0}}
`
