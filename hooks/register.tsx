import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, ThemeSetArgs } from 'claude-code'

import type { Git, Meter } from '../types'
import { TRANSIENT_MS } from './critter'
import type { ActivityKind } from './critter'
import { makeColors } from './make-colors.js'
import { bandSvg, bandText } from './meter'
import type { CiState } from './meter'
import { SCENE as SCENE_ALLEY } from './scene'
import { SCENE as SCENE_CHEONGGYE } from './scene-cheonggye'
import { SCENE as SCENE_HAN } from './scene-han'
import { CRITTER_COLUMNS, FRAME_MS, GAP, critterFrame, termBand, termBandColumns, toCells } from './term'
import type { CritterScene, Line } from './term'

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

// The backdrops to choose from with /backdrop (or its Polish twin /tlo); the choice is kept across sessions in the mod's store.
const SCENES = {
  han: { source: SCENE_HAN, alt: 'Rzeka Han nocą: wzgórze Namsan z wieżą, bloki i długi most ze światłami samochodów', label: 'Han nocą z Namsan', labelEn: 'the Han at night, seen from Namsan' },
  cheonggye: { source: SCENE_CHEONGGYE, alt: 'Strumień Cheonggyecheon o zmierzchu, biurowce i kołyszące się kolorowe lampiony', label: 'Cheonggyecheon z lampionami', labelEn: 'Cheonggyecheon with lanterns' },
  alley: { source: SCENE_ALLEY, alt: 'Neonowa uliczka nocą z namiotem pocha, stolikami z soju i małymi stworkami', label: 'neonowa uliczka z pocha', labelEn: 'a neon alley with a pocha tent' },
} as const
type SceneName = keyof typeof SCENES
const DEFAULT_SCENE: SceneName = 'han'
const STORE_SCENE = 'scene'
const isScene = (name: unknown): name is SceneName => typeof name === 'string' && name in SCENES

// Scene names reach the surface prefixed, so another mod's backdrop is never mistaken for ours.
const SCENE_PREFIX = 'seoul-night-'

const lookWith = (scene: SceneName): ThemeSetArgs => ({
  colors: theme,
  backdrop: {
    scene: `${SCENE_PREFIX}${scene}`,
    glass: { blur: 18, tint: '#0c0b1f', opacity: 0.6 },
  },
})

const chosenScene = async ($: EngineInterface): Promise<SceneName> => {
  const stored = await $.store.get(STORE_SCENE)
  return isScene(stored) ? stored : DEFAULT_SCENE
}

// /backdrop answers in English, /tlo in Polish; both pick from the same scenes and store.
const switchScene = async ($: EngineInterface, args: string, english: boolean) => {
  const name = args.trim().toLowerCase()
  const list = (Object.entries(SCENES) as [SceneName, (typeof SCENES)[SceneName]][])
    .map(([key, s]) => `${key}: ${english ? s.labelEn : s.label}`)
    .join('\n')
  if (name === '') {
    const now = await chosenScene($)
    return { text: english ? `Now: ${now}. Choose from:\n${list}` : `Teraz: ${now}. Do wyboru:\n${list}` }
  }
  if (!isScene(name)) {
    return { text: english ? `No backdrop called "${name}". Choose from:\n${list}` : `Nie znam tła „${name}”. Do wyboru:\n${list}` }
  }
  await $.store.set(STORE_SCENE, name)
  await $.theme.set(lookWith(name))

  return { text: english ? `Backdrop: ${SCENES[name].labelEn}.` : `Tło: ${SCENES[name].label}.` }
}

// What the band above the prompt draws from.
const meter = atom({ plugin: 'seoul-night', key: 'meter' } as const, null)
const work = atom({ plugin: 'seoul-night', key: 'work' } as const, null)
const git = atom({ plugin: 'seoul-night', key: 'git' } as const, null)
const now = atom({ plugin: 'seoul-night', key: 'now' } as const, 0)
const activity = atom({ plugin: 'seoul-night', key: 'activity' } as const, null)
// Flips every few seconds: the terminal critter's two lines take turns by it.
const phase = atom({ plugin: 'seoul-night', key: 'phase' } as const, 0)
const PHASE_MS = 8000

// What the line says while a turn runs: drawn at random per kind of work, and again every few seconds.
const WORDS = {
  thinking: ['눈치 보는 중', '라면 물 올리는 중', '아아 수혈 중', '코드랑 썸 타는 중', '노래방 100점 노리는 중'],
  tools: ['빨리빨리 하는 중', '일하는 척하는 중', '야근 각 재는 중', '버그한테 고백하는 중', 'PC방에서 밤새는 중'],
  reply: ['카톡 답장 쓰는 중', '소주 뚜껑 돌리는 중', '치맥 시키는 중', '드라마 대사 외우는 중'],
}
const ROTATE_MS = 8000

// A tool step told in Korean. The step is known from the tool that runs (`stepOfTool`), and failing
// that from the desktop's description of it (`Creating notes.md`, `Running a command`).
// `{x}` is the file the step works on; a step that names none takes the bare phrase.
type StepKind = 'create' | 'edit' | 'read' | 'run' | 'search' | 'web'

const STEPS: Record<StepKind, { verbs: RegExp; named: string[]; bare: string[] }> = {
  create: { verbs: /^(creat|writ|wrote|add)/i, named: ['{x} 빚는 중', '{x} 뚝딱 만드는 중', '{x} 출산 중'], bare: ['뭔가 뚝딱 만드는 중'] },
  edit: { verbs: /^(edit|updat|modif|chang|patch|apply|fix|mak\w* (edit|change))/i, named: ['{x} 손보는 중', '{x} 성형 중', '{x} 화장 고치는 중'], bare: ['코드 성형 중', '살짝 손보는 중'] },
  read: { verbs: /^(read|view|open)/i, named: ['{x} 정독하는 중', '{x} 훑어보는 중'], bare: ['정독하는 중'] },
  run: { verbs: /^(run|ran|execut)/i, named: [], bare: ['명령어 돌리는 중', '터미널에 주문 넣는 중', '엔터 꾹 누르는 중'] },
  search: { verbs: /^(search|find|found|list|grep|glob|look)/i, named: [], bare: ['구석구석 뒤지는 중', '숨은 그림 찾는 중'] },
  web: { verbs: /^(fetch|brows|download)/i, named: [], bare: ['인터넷 서핑 중', '네이버에 물어보는 중'] },
}

const stepOfTool = (tool: string): StepKind | null => {
  if (tool === 'Write') return 'create'
  if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') return 'edit'
  if (tool === 'Read') return 'read'
  if (tool === 'Bash' || tool === 'PowerShell') return 'run'
  if (tool === 'Grep' || tool === 'Glob') return 'search'
  if (tool === 'WebFetch' || tool === 'WebSearch') return 'web'
  return null
}

const baseName = (path: string): string | null => path.split(/[\\/]/).filter(Boolean).pop() ?? null

// The file a tool call works on, by the input names the built-in tools use.
const fileOfInput = (input: unknown): string | null => {
  if (typeof input !== 'object' || input === null) return null
  const fields = input as Record<string, unknown>
  const path = fields.file_path ?? fields.notebook_path
  return typeof path === 'string' ? baseName(path) : null
}

const phraseFor = (step: StepKind, file: string | null): string | null => {
  const { named, bare } = STEPS[step]
  const phrase = file !== null && named.length > 0 ? pickFrom(named) : pickFrom(bare)
  return phrase === undefined ? null : phrase.replace('{x}', file ?? '')
}

const pickFrom = (pool: readonly string[], avoid?: string): string | undefined => {
  const choices = pool.length > 1 && avoid !== undefined ? pool.filter(p => p !== avoid) : pool
  return choices[Math.floor(Math.random() * choices.length)]
}

// A file or path the description names, as its last segment; a plain phrase (`a command`) names nothing.
const namedThing = (rest: string): string | null => {
  const token = rest.trim().split(/\s+/)[0] ?? ''
  return /[./\\]/.test(token) ? baseName(token) : null
}

const stepInKorean = (word: string): string | null => {
  for (const [step, { verbs }] of Object.entries(STEPS) as [StepKind, (typeof STEPS)[StepKind]][]) {
    const match = word.match(verbs)
    if (match) return phraseFor(step, namedThing(word.slice(match[0].length).replace(/^\w*/, '')))
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
  const before = await read($, git)
  await update($, git, () => next)
  // CI that just turned green gets a little dance
  if (before !== null && before.ci !== 'pass' && next.ci === 'pass' && before.pr === next.pr) {
    await setActivity($, 'ci-pass')
  }
}

// What the critter is doing; a passing state is redrawn away once its time is up.
// The desktop draws the band as an image and redraws it with a lag, so each write here costs a
// visible redraw: a kind that has not changed is not written again. Returns the kind's `since`.
const setActivity = async ($: EngineInterface, kind: ActivityKind, turnStartedAt?: number | null): Promise<number> => {
  const current = await read($, activity)
  const startedAt = turnStartedAt === undefined ? (current?.turnStartedAt ?? null) : turnStartedAt
  const isPassing = kind === 'done' || kind === 'error' || kind === 'ci-pass'
  if (current !== null && current.kind === kind && current.turnStartedAt === startedAt && !isPassing) {
    return current.since
  }
  const at = await $.clock.now()
  await update($, activity, () => ({ kind, since: at, turnStartedAt: startedAt }))
  await update($, now, () => at)
  if (isPassing) {
    $.clock.after(TRANSIENT_MS[kind] + 300, () => void tick($))
  }
  return at
}

/** How long the critter keeps a tool's look after the tool ends, so quick tools do not flicker. */
const HOLD_TOOL_MS = 4000

const toolKind = (tool: string): ActivityKind => {
  if (tool === 'Bash' || tool === 'PowerShell') return 'bash'
  if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') return 'edit'
  if (tool === 'Read' || tool === 'Grep' || tool === 'Glob') return 'read'
  if (tool === 'WebFetch' || tool === 'WebSearch') return 'web'
  return 'thinking'
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
  // the terminal band's critter, moved a frame at a time by blits: where it is drawn, what it acts out
  let frame = 0
  let stage: { requestId: string; scene: CritterScene; cells: string } | null = null
  // the tool step running now, as the tool and its file tell it
  let running: { step: StepKind; file: string | null } | null = null

  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    const set = await $.theme.set(lookWith(await chosenScene($)))

    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }
    await $.command.register({
      name: 'backdrop',
      description: `Switches the backdrop: ${Object.keys(SCENES).join(', ')}`,
    })
    await $.command.register({
      name: 'tlo',
      description: `Zmienia tło: ${Object.keys(SCENES).join(', ')}`,
    })
    const usage = await $.session.usage()
    await update($, meter, () => toMeter(usage.rateLimits, usage.context.percent))
    const offset = await utcOffset($)
    await update($, work, w => ({ startedAt: usage.startedAt, turns: w?.turns ?? 0, utcOffsetMin: offset }))
    await tick($)
    $.clock.every(60_000, () => void tick($))
    $.clock.every(PHASE_MS, () => void update($, phase, p => (p + 1) % 1000))
    $.clock.every(FRAME_MS, () => {
      frame = (frame + 1) % 1_000_000
      const at = stage
      if (at === null) return
      const { cells } = toCells(critterFrame(at.scene, frame))
      // a still frame costs nothing
      if (cells === at.cells) return
      at.cells = cells
      void $.ui.blit({ requestId: at.requestId, key: 'critter', cells }).then(r => {
        // gone from the screen: the next drawing of the band seats it again
        if (r.deny !== undefined && stage === at) stage = null
      })
    })
    // CI moves without any turn of ours, so look again every two minutes
    $.clock.every(120_000, () => void refreshGit($))
    await refreshGit($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, meter, () => toMeter(e.rateLimits, e.context.percent))

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // a new turn starts with a fresh phrase
    shown = null
    await setActivity($, 'thinking', await $.clock.now())

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const step = stepOfTool(e.tool)
    running = step === null ? null : { step, file: fileOfInput(e) }
    const since = await setActivity($, toolKind(e.tool))
    const result = await next(e)
    running = null
    const failed = result.deny !== undefined || result.isError === true
    if (failed) {
      await setActivity($, 'error')
    } else {
      // back to thinking only if no other tool or turn end came along meanwhile
      $.clock.after(HOLD_TOOL_MS, () => {
        void (async () => {
          const a = await read($, activity)
          if (a !== null && a.since === since && a.kind === toolKind(e.tool)) await setActivity($, 'thinking')
        })()
      })
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    await setActivity($, 'done', null)
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
    // a tool we know is running, or the desktop describing a step in its own words
    const isToolStep =
      e.surface === 'desktop' && (running !== null || ((mode === 'tool-use' || mode === 'tool-input') && word !== 'Working'))
    if (isToolStep) {
      // one phrase per step, so the line does not flicker while the step runs
      const key = `${word}|${running?.step ?? ''}|${running?.file ?? ''}`
      let phrase = stepPhrases.get(key)
      if (phrase === undefined) {
        phrase = (running !== null ? phraseFor(running.step, running.file) : null) ?? stepInKorean(word) ?? word
        if (stepPhrases.size > 200) stepPhrases.clear()
        stepPhrases.set(key, phrase)
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

  on('command.run', { command: 'backdrop' }, ($, e) => switchScene($, e.args, true))

  on('command.run', { command: 'tlo' }, ($, e) => switchScene($, e.args, false))

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    const name = e.props.scene.startsWith(SCENE_PREFIX) ? e.props.scene.slice(SCENE_PREFIX.length) : null
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || !isScene(name)) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)
    const scene = SCENES[name]

    return <Svg source={scene.source} alt={scene.alt} isInteractive />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }
    const figures = {
      meter: await read($, meter),
      work: await read($, work),
      git: await read($, git),
      activity: await read($, activity),
      isWorking: e.props.isWorking,
      now: await read($, now),
    }

    if (e.surface === 'desktop' || e.surface === 'mobile') {
      const { Svg } = $.ui.resolve(e)

      return <Svg source={bandSvg(figures)} alt={bandText(figures)} />
    }
    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>{bandText(figures)}</Text>
    }
    const { Box, Raster, Text } = $.ui.resolve(e)

    const band = termBand(figures, await read($, phase))
    const need = termBandColumns(band)
    const cols = e.props.bodyColumns
    if (cols < need.compact) {
      stage = null
      return <Text dimColor>{bandText(figures)}</Text>
    }
    const critter = toCells(critterFrame(band.critter.scene, frame))
    stage = { requestId: e.requestId, scene: band.critter.scene, cells: critter.cells }
    const isFull = cols >= need.full
    const line = (l: Line, i: number) => (
      <Text key={String(i)} color={l.color} dimColor={l.dim} bold={l.bold} wrap="truncate">
        {l.text === '' ? ' ' : l.text}
      </Text>
    )
    const meters = (
      <Box flexDirection="row" columnGap={GAP}>
        <Box flexDirection="column" alignItems="center" width={CRITTER_COLUMNS}>
          <Text color="#ff9ee0" wrap="truncate">
            {band.critter.tag}
          </Text>
          <Raster key="critter" {...critter} />
        </Box>
        {band.meters.map(m => (
          <Box key={m.key} flexDirection="row" columnGap={1}>
            <Raster key={m.key} {...m.cells} />
            <Box flexDirection="column" justifyContent="flex-end" width={m.textColumns}>
              {m.lines.map(line)}
            </Box>
          </Box>
        ))}
        {isFull ? (
          <Box flexDirection="column" justifyContent="flex-end">
            {band.day.map(line)}
          </Box>
        ) : null}
      </Box>
    )

    return (
      <Box flexDirection="column" alignSelf="flex-start" paddingX={1} borderStyle="round" borderColor="#3a2a5c">
        {meters}
        {isFull ? null : (
          <Box flexDirection="row" columnGap={GAP}>
            {band.day.filter(l => l.text !== '').map(line)}
          </Box>
        )}
      </Box>
    )
  })
}
