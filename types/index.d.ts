import type { Activity } from '../hooks/critter'
import type { Git, Meter, Work } from '../hooks/meter'

export type { Activity, Git, Meter, Work }

declare module 'claude-code' {
  interface PluginState {
    'seoul-night': {
      meter: Meter | null
      work: Work | null
      git: Git | null
      activity: Activity | null
      now: number
    }
  }
}
