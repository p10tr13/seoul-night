import { expect, test } from 'claude-code/testing'

import { critterFrame, termBand, termBandLayout } from '../hooks/term'

const band = (bodyColumns: number) =>
  ({
    plugin: 'seoul-night',
    component: 'AbovePrompt',
    surface: 'terminal',
    props: {
      hasSurvey: false,
      isCollapsed: false,
      isWorking: false,
      maxRows: 20,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 19 },
      view: {},
    },
  }) as const

test('a wide terminal draws the pixel band with the workday beside it', async $ => {
  const ui = await $.ui.mount(band(130))

  expect(await ui.find({ type: 'Raster', key: 'critter' })).toBeTruthy()
  expect(await ui.find({ type: 'Raster', key: 'glass' })).toBeTruthy()
  expect(await ui.find({ type: 'Raster', key: 'bottle' })).toBeTruthy()
  expect(await ui.find({ type: 'Raster', key: 'skewer' })).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /소맥/ }))?.text).toBe('소맥 · 5시간')
  await ui.unmount()
})

test('a middling terminal keeps the pixels', async $ => {
  const ui = await $.ui.mount(band(88))

  expect(await ui.find({ type: 'Raster', key: 'glass' })).toBeTruthy()
  await ui.unmount()
})

test('a narrow terminal gets the one line of text', async $ => {
  const ui = await $.ui.mount(band(70))

  expect(await ui.find({ type: 'Raster', key: 'glass' })).toBeFalsy()
  expect((await ui.find({ type: 'Text', text: /소맥/ }))?.text).toMatch(/^소맥 -- · 소주/)
  await ui.unmount()
})

test('the critter moves through its frames, each state its own way', async () => {
  const states = ['idle', 'thinking', 'bash', 'edit', 'read', 'web', 'done', 'error', 'sleep', 'coffee', 'tipsy', 'ci-pass'] as const
  for (const state of states) {
    const frames = new Set(Array.from({ length: 24 }, (_, t) => JSON.stringify(critterFrame({ state, offHours: null }, t))))
    expect(frames.size).toBeGreaterThan(1)
  }
})

test("the pixels stay whatever the critter says: a turn's end does not drop them to text", async () => {
  const now = Date.parse('2026-11-26T10:05:00Z')
  const figures = (kind: 'thinking' | 'done', isWorking: boolean) => ({
    meter: null,
    work: null,
    git: null,
    activity: { kind, since: now, turnStartedAt: now - 5000 },
    isWorking,
    now,
  })
  const narrowest = (band: ReturnType<typeof termBand>) => {
    let columns = 40
    while (!termBandLayout(band, columns).pixels) columns++
    return columns
  }
  const working = termBand(figures('thinking', true), 0)
  const done = termBand(figures('done', false), 1)
  expect(done.critter.tag.length).toBeGreaterThan(working.critter.tag.length)
  expect(narrowest(done)).toBe(narrowest(working))
  // where only the pixels fit, the critter's line gives way
  expect(termBandLayout(done, narrowest(done)).tag).toBe(false)
})
