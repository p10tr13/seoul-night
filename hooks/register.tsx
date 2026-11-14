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

// What the line says while a turn runs, picked per turn and per kind of work.
const WORDS = {
  thinking: ['눈치 보는 중', '라면 물 올리는 중', '아아 수혈 중', '코드랑 썸 타는 중', '노래방 100점 노리는 중'],
  tools: ['빨리빨리 하는 중', '일하는 척하는 중', '야근 각 재는 중', '버그한테 고백하는 중', 'PC방에서 밤새는 중'],
  reply: ['카톡 답장 쓰는 중', '소주 뚜껑 돌리는 중', '치맥 시키는 중', '드라마 대사 외우는 중'],
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
  let turnNo = 0

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
    turnNo += 1

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await update($, work, w => (w === null ? w : { ...w, turns: w.turns + 1 }))
    await tick($)
    await refreshGit($)

    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    const { mode, word, message } = e.props
    // keep a state's own message, and the desktop's description of a tool step
    const isToolStep = (mode === 'tool-use' || mode === 'tool-input') && e.surface === 'desktop' && word !== 'Working'
    if (message !== null || isToolStep) {
      return next(e)
    }
    const pool =
      mode === 'tool-use' || mode === 'tool-input' ? WORDS.tools : mode === 'responding' ? WORDS.reply : WORDS.thinking
    const picked = pool[(turnNo * 7 + mode.length) % pool.length] ?? word

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
