// Prints the terminal band's sprites in ANSI colors for a visual check: npx tsx tools/term-preview.mjs
const { bottlePixels, critterPixels, glassPixels, skewerPixels, termBand } = await import(process.argv[2])

const fg = h => (h === null ? '\x1b[39m' : `\x1b[38;2;${parseInt(h.slice(1, 3), 16)};${parseInt(h.slice(3, 5), 16)};${parseInt(h.slice(5, 7), 16)}m`)
const bg = h => (h === null ? '\x1b[49m' : `\x1b[48;2;${parseInt(h.slice(1, 3), 16)};${parseInt(h.slice(3, 5), 16)};${parseInt(h.slice(5, 7), 16)}m`)
const lines = px => {
  const out = []
  for (let y = 0; y < px.length; y += 2) {
    let s = ''
    for (let x = 0; x < px[y].length; x++) {
      const t = px[y][x], b = px[y + 1]?.[x] ?? null
      s += t === null && b === null ? '\x1b[0m ' : t === null ? `${bg(null)}${fg(b)}▄` : `${fg(t)}${bg(b)}▀`
    }
    out.push(s + '\x1b[0m')
  }
  return out
}
const sprites = [critterPixels('idle', false), critterPixels('tipsy', false), glassPixels(72), glassPixels(12), bottlePixels(45), skewerPixels(62)]
const cols = sprites.map(lines)
for (let r = 0; r < 6; r++) console.log(cols.map(c => c[r]).join('  '))
const now = Date.parse('2026-11-14T14:41:00Z')
const band = termBand({ meter: { fiveHour: 28, fiveResetsAt: '2026-11-14T17:00:00Z', week: 55, weekResetsAt: '2026-11-17T15:00:00Z', context: 38 }, work: { startedAt: now - 7e6, turns: 12, utcOffsetMin: 60 }, git: { branch: 'main', dirty: 2, ahead: 1, pr: 4, ci: 'pass' }, activity: null, isWorking: false, now }, 0)
console.log(band.critter.tag, band.meters.map(m => m.lines.map(l => l.text).join(' / ')), band.day.map(l => l.text))
