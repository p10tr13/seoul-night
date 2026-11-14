import { expect, test } from 'claude-code/testing'

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
  const ui = await $.ui.mount(band(100))

  expect(await ui.find({ type: 'Raster', key: 'glass' })).toBeTruthy()
  await ui.unmount()
})

test('a narrow terminal gets the one line of text', async $ => {
  const ui = await $.ui.mount(band(80))

  expect(await ui.find({ type: 'Raster', key: 'glass' })).toBeFalsy()
  expect((await ui.find({ type: 'Text', text: /소맥/ }))?.text).toMatch(/^소맥 -- · 소주/)
  await ui.unmount()
})
