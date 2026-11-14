import type { Git, Meter, Work } from '../hooks/meter'

export type { Git, Meter, Work }

declare module 'claude-code' {
  interface PluginState {
    'seoul-night': {
      meter: Meter | null
      work: Work | null
      git: Git | null
      now: number
    }
  }
}
