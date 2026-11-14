import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, ThemeSetArgs } from 'claude-code'

import type { Git, Meter } from '../types'
import { makeColors } from './make-colors.js'
import { bandSvg, bandText } from './meter'
import type { CiState } from './meter'
import { SCENE } from './scene'

// A Korean city at night: indigo sky, neon pink and cyan, warm windows.
const { theme, problems } = makeColors({
  label: 'Seoul night',
  only: 'dark',
  roles: {
    accent: '#ff5fa8',
    danger: '#ff5468',
    success: '#55e0b0',
    warning: '#ffb85c',
    pro: '#8f86ff',
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0b0b1d',
        'surface-1': '#121229',
        'surface-2': '#181834',
        'surface-3': '#1d1d3b',
        'text-primary': '#eeeaf7',
        'text-secondary': '#c6c0da',
        'text-muted': '#9d96b8',
      },
    },
  },
})

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: {
    scene: 'seoul-night',
    glass: { blur: 18, tint: '#0c0b1f', opacity: 0.6 },
  },
}

// What the band above the prompt draws from.
const meter = atom({ plugin: 'seoul-night', key: 'meter' } as const, null)
const work = atom({ plugin: 'seoul-night', key: 'work' } as const, null)
const git = atom({ plugin: 'seoul-night', key: 'git' } as const, null)
const now = atom({ plugin: 'seoul-night', key: 'now' } as const, 0)

// What the line says while a turn runs: drawn at random per kind of work, and again every few seconds.
const WORDS = {
  thinking: ['눈치 보는 중', '라면 물 올리는 중', '아아 수혈 중', '코드랑 썸 타는 중', '노래방 100점 노리는 중'],
  tools: ['빨리빨리 하는 중', '일하는 척하는 중', '야근 각 재는 중', '버그한테 고백하는 중', 'PC방에서 밤새는 중'],
  reply: ['카톡 답장 쓰는 중', '소주 뚜껑 돌리는 중', '치맥 시키는 중', '드라마 대사 외우는 중'],
}
const ROTATE_MS = 8000

// The desktop's description of a tool step (`Creating notes.md`, `Running a command`), told in Korean.
// `{x}` is the file or thing the step names; a step that names none takes the bare phrase.
const STEPS: { verbs: RegExp; named: string[]; bare: string[] }[] = [
  { verbs: /^(creating|writing)\b/i, named: ['{x} 빚는 중', '{x} 뚝딱 만드는 중', '{x} 출산 중'], bare: ['뭔가 뚝딱 만드는 중'] },
  { verbs: /^(editing|updating|modifying)\b/i, named: ['{x} 손보는 중', '{x} 성형 중', '{x} 화장 고치는 중'], bare: ['코드 성형 중'] },
  { verbs: /^(reading|viewing|opening)\b/i, named: ['{x} 정독하는 중', '{x} 훑어보는 중'], bare: ['정독하는 중'] },
  { verbs: /^(running|executing)\b/i, named: [], bare: ['명령어 돌리는 중', '터미널에 주문 넣는 중', '엔터 꾹 누르는 중'] },
  { verbs: /^(searching|finding|listing|grepping|globbing|looking)\b/i, named: [], bare: ['구석구석 뒤지는 중', '숨은 그림 찾는 중'] },
  { verbs: /^(fetching|browsing|downloading)\b/i, named: [], bare: ['인터넷 서핑 중', '네이버에 물어보는 중'] },
]

const pickFrom = (pool: readonly string[], avoid?: string): string | undefined => {
  const choices = pool.length > 1 && avoid !== undefined ? pool.filter(p => p !== avoid) : pool
  return choices[Math.floor(Math.random() * choices.length)]
}

// A file or path the step names, as its last segment; a plain phrase (`a command`) names nothing.
const namedThing = (rest: string): string | null => {
  const token = rest.trim().split(/\s+/)[0] ?? ''
  if (!/[./\\]/.test(token)) return null
  return token.split(/[\\/]/).filter(Boolean).pop() ?? null
}

const stepInKorean = (word: string): string | null => {
  for (const step of STEPS) {
    const match = word.match(step.verbs)
    if (!match) continue
    const thing = namedThing(word.slice(match[0].length))
    const phrase = thing !== null && step.named.length > 0 ? pickFrom(step.named) : pickFrom(step.bare)
    return phrase === undefined ? null : phrase.replace('{x}', thing ?? '')
  }
  return null
}
const HINT = '한 잔 할까?'

const toMeter = (rateLimits: readonly SessionRateLimit[], contextPercent: number | undefined): Meter => {
  const five = rateLimits.find(w => w.kind === 'five_hour')
  const week = rateLimits.find(w => w.kind === 'seven_day')
  return {
    fiveHour: five?.percentUsed ?? null,
    fiveResetsAt: five?.resetsAt ?? null,
    week: week?.percentUsed ?? null,
    weekResetsAt: week?.resetsAt ?? null,
    context: contextPercent ?? null,
  }
}

const run = async ($: EngineInterface, argv: string[]): Promise<string | null> => {
  try {
    const { exitCode, stdout } = await $.process.run(argv, { timeoutMs: 15_000 })
    return exitCode === 0 ? stdout : null
  } catch {
    return null
  }
}

type Check = { status?: string; conclusion?: string; state?: string }

// One state for the whole PR: any failure fails it, anything still running keeps it pending.
const ciOf = (checks: readonly Check[]): CiState | null => {
  if (checks.length === 0) return null
  const failed = ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR']
  if (checks.some(c => failed.includes(c.conclusion ?? '') || failed.includes(c.state ?? ''))) return 'fail'
  const running = (c: Check) =>
    (c.status !== undefined && c.status !== 'COMPLETED') || c.state === 'PENDING' || c.state === 'EXPECTED'
  if (checks.some(running)) return 'pending'
  return 'pass'
}

const refreshGit = async ($: EngineInterface) => {
  const head = await run($, ['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
  if (head === null) {
    await update($, git, () => null)
    return
  }
  const status = (await run($, ['git', 'status', '--porcelain'])) ?? ''
  const ahead = Number.parseInt((await run($, ['git', 'rev-list', '--count', '@{u}..HEAD'])) ?? '0', 10)
  let pr: number | null = null
  let ci: CiState | null = null
  const view = await run($, ['gh', 'pr', 'view', '--json', 'number,statusCheckRollup'])
  if (view !== null) {
    try {
      const parsed = JSON.parse(view) as { number?: number; statusCheckRollup?: Check[] }
      pr = parsed.number ?? null
      ci = ciOf(parsed.statusCheckRollup ?? [])
    } catch {
      pr = null
    }
  }
  const next: Git = {
    branch: head.trim() || null,
    dirty: status.split('\n').filter(line => line.trim() !== '').length,
    ahead: Number.isFinite(ahead) ? ahead : 0,
    pr,
    ci,
  }
  await update($, git, () => next)
}

// The machine's UTC offset, read from git's committer identity (`... 1731590000 +0100`).
const utcOffset = async ($: EngineInterface): Promise<number | null> => {
  const ident = await run($, ['git', 'var', 'GIT_COMMITTER_IDENT'])
  const match = ident?.trim().match(/([+-])(\d{2})(\d{2})$/)
  if (!match) return null
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return match[1] === '-' ? -minutes : minutes
}

const tick = async ($: EngineInterface) => {
  const ms = await $.clock.now()
  await update($, now, () => ms)
}

export const register: Register = on => {
  // the phrase on the line now, and each tool step's phrase
  let shown: { pool: readonly string[]; word: string; at: number } | null = null
  const stepPhrases = new Map<string, string>()

  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    const set = await $.theme.set(LOOK)

    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }
    const usage = await $.session.usage()
    await update($, meter, () => toMeter(usage.rateLimits, usage.context.percent))
    const offset = await utcOffset($)
    await update($, work, w => ({ startedAt: usage.startedAt, turns: w?.turns ?? 0, utcOffsetMin: offset }))
    await tick($)
    $.clock.every(30_000, () => void tick($))
    // CI moves without any turn of ours, so look again every two minutes
    $.clock.every(120_000, () => void refreshGit($))
    await refreshGit($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, meter, () => toMeter(e.rateLimits, e.context.percent))

    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    // a new turn starts with a fresh phrase
    shown = null

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await update($, work, w => (w === null ? w : { ...w, turns: w.turns + 1 }))
    await tick($)
    await refreshGit($)

    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const { mode, word, message } = e.props
    // a state's own message stays as it is
    if (message !== null) {
      return next(e)
    }
    const isToolStep = (mode === 'tool-use' || mode === 'tool-input') && e.surface === 'desktop' && word !== 'Working'
    if (isToolStep) {
      // one phrase per step, so the line does not flicker while the step runs
      let phrase = stepPhrases.get(word)
      if (phrase === undefined) {
        phrase = stepInKorean(word) ?? word
        if (stepPhrases.size > 200) stepPhrases.clear()
        stepPhrases.set(word, phrase)
      }
      return next({ ...e, props: { ...e.props, word: phrase } })
    }
    const pool =
      mode === 'tool-use' || mode === 'tool-input' ? WORDS.tools : mode === 'responding' ? WORDS.reply : WORDS.thinking
    const at = await $.clock.now()
    if (shown === null || shown.pool !== pool || at - shown.at > ROTATE_MS) {
      shown = { pool, word: pickFrom(pool, shown?.word) ?? word, at }
    }
    const picked = shown.word

    return next({ ...e, props: { ...e.props, word: picked } })
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    if (e.props.isWorking) {
      return next(e)
    }
    const hint = e.props.hint.trim() === '' ? HINT : `${e.props.hint} · ${HINT}`

    return next({ ...e, props: { ...e.props, hint } })
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || e.props.scene !== 'seoul-night') {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)

    return <Svg source={SCENE} alt="Neonowa uliczka nocą z namiotem pocha, stolikami z soju i małymi stworkami" isInteractive />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }
    const figures = {
      meter: await read($, meter),
      work: await read($, work),
      git: await read($, git),
      now: await read($, now),
    }

    if (e.surface === 'desktop' || e.surface === 'mobile') {
      const { Svg } = $.ui.resolve(e)

      return <Svg source={bandSvg(figures)} alt={bandText(figures)} />
    }
    const { Text } = $.ui.resolve(e)

    return <Text dimColor>{bandText(figures)}</Text>
  })
}
