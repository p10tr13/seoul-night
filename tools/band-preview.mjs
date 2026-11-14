// Renders the band in a few situations to SVG files for a visual check.
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const { bandSvg } = await import(pathToFileURL(process.argv[2]).href)
const meter = { fiveHour: 38, fiveResetsAt: '2026-11-12T16:54:00Z', week: 55, weekResetsAt: '2026-11-15T15:00:00Z', context: 62 }
const cases = [
  // Thursday 13:41 local (+01:00): time to leave
  ['day', Date.parse('2026-11-12T12:41:00Z'), { branch: 'feat/new-band', dirty: 5, ahead: 2, pr: 38, ci: 'pass' }],
  // Thursday 20:10 local: overtime, CI running
  ['night', Date.parse('2026-11-12T19:10:00Z'), { branch: 'main', dirty: 0, ahead: 0, pr: 41, ci: 'pending' }],
  // Saturday: weekend work, CI failed
  ['weekend', Date.parse('2026-11-14T14:41:00Z'), { branch: 'fix/very-long-branch-name-here', dirty: 1, ahead: 0, pr: null, ci: null }],
]
for (const [name, now, git] of cases) {
  const work = { startedAt: now - 133 * 60000, turns: 37, utcOffsetMin: 60 }
  writeFileSync(`band-${name}.svg`, bandSvg({ meter, work, git, now }))
}
const failing = { branch: 'main', dirty: 0, ahead: 3, pr: 42, ci: 'fail' }
writeFileSync('band-fail.svg', bandSvg({ meter, work: null, git: failing, now: cases[0][1] }))
