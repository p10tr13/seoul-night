// The seoul-night state contract: every value the hooks module keeps in `$.state`.

export type ActivityKind = 'idle' | 'thinking' | 'bash' | 'edit' | 'read' | 'web' | 'done' | 'error' | 'ci-pass'

export type Activity = {
  kind: ActivityKind
  /** When this kind began, epoch ms. */
  since: number
  /** When the running turn began; null between turns. */
  turnStartedAt: number | null
}

export type Meter = {
  /** Percent used of the 5-hour window; null before the first reading or off a subscription. */
  fiveHour: number | null
  fiveResetsAt: string | null
  week: number | null
  weekResetsAt: string | null
  /** Percent of the context window filled. */
  context: number | null
}

export type Work = {
  /** When the session began, epoch ms. */
  startedAt: number
  turns: number
  /** The machine's offset from UTC in minutes, as git reports it; null when unknown. */
  utcOffsetMin: number | null
}

export type CiState = 'pass' | 'fail' | 'pending'

export type Git = {
  branch: string | null
  /** Files changed and not committed. */
  dirty: number
  /** Commits not pushed to the upstream. */
  ahead: number
  pr: number | null
  ci: CiState | null
}

declare module 'claude-code' {
  interface PluginState {
    'seoul-night': {
      meter: Meter | null
      work: Work | null
      git: Git | null
      activity: Activity | null
      now: number
      /** Flips every few seconds: the terminal critter's two lines take turns by it. */
      phase: number
    }
  }
}
