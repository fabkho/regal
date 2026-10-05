import { describe, expect, it } from 'vitest'
import { INSPECT_ASIDE, INSPECT_FILL, INSPECT_LIFT, inspectFrame, LIFT_FADE, stageInsets } from '../../app/utils/books/inspect'
import { dragOffset, RUBBER, settleDrag, SHEET_MAX_WIDTH, SHEET_SHARE, sheetMaxHeight, showsSheet } from '../../app/utils/books/sheet'

const FOV = 38 * Math.PI / 180
const tan = Math.tan(FOV / 2)

describe('inspectFrame', () => {
  it('without a sheet: fills INSPECT_FILL of the view height, a little above centre, left on wide views', () => {
    const frame = inspectFrame({ fov: FOV, aspect: 1.6, height: 0.2, depth: 0.13, aside: true })
    const distance = 0.2 / (2 * tan * INSPECT_FILL)
    expect(frame.distance).toBeCloseTo(distance)
    expect(frame.up).toBeCloseTo(distance * INSPECT_LIFT)
    expect(frame.right).toBeCloseTo(-distance * tan * 1.6 * INSPECT_ASIDE)
  })

  it('stays centred on portrait views and when nothing is aside', () => {
    expect(inspectFrame({ fov: FOV, aspect: 0.6, height: 0.2, depth: 0.13, aside: true }).right).toBe(0)
    expect(inspectFrame({ fov: FOV, aspect: 1.6, height: 0.2, depth: 0.13 }).right).toBe(0)
  })

  /** Where the Book's top and bottom edges land, as shares of the view height from the top. */
  function edges(input: Parameters<typeof inspectFrame>[0]) {
    const frame = inspectFrame(input)
    const half = frame.distance * tan
    const centre = 0.5 - frame.up / half / 2
    const share = input.height / (2 * half)
    return { top: centre - share / 2, bottom: centre + share / 2 }
  }

  it('sits in the band a bottom sheet leaves free', () => {
    const book = { fov: FOV, aspect: 0.62, height: 0.2, depth: 0.13 }
    for (const bottom of [0.2, 0.3, 0.4]) {
      const { top, bottom: lower } = edges({ ...book, bottom })
      expect(top).toBeGreaterThan(0)
      expect(lower).toBeLessThan(1 - bottom)
    }
  })

  it('sits centred in the band between a bar and a sheet', () => {
    const book = { fov: FOV, aspect: 0.62, height: 0.2, depth: 0.13 }
    for (const [top, bottom] of [[0, 0.33], [0.1, 0.3], [0.05, 0.4]] as const) {
      const edge = edges({ ...book, top, bottom })
      expect((edge.top + edge.bottom) / 2).toBeCloseTo(top + (1 - top - bottom) / 2, 6)
    }
  })

  it('lets the lift go gradually as the view gets covered, so the Book never jumps', () => {
    const book = { fov: FOV, aspect: 0.62, height: 0.2, depth: 0.13 }
    const centreShift = (bottom: number) => {
      const edge = edges({ ...book, bottom })
      return (1 - bottom) / 2 - (edge.top + edge.bottom) / 2
    }
    expect(centreShift(0)).toBeGreaterThan(0)
    expect(centreShift(LIFT_FADE / 2)).toBeGreaterThan(0)
    expect(centreShift(LIFT_FADE / 2)).toBeLessThan(centreShift(0))
    expect(centreShift(LIFT_FADE)).toBeCloseTo(0, 9)
  })

  it('keeps clear of a top band too', () => {
    const { top, bottom } = edges({ fov: FOV, aspect: 0.62, height: 0.2, depth: 0.13, top: 0.12, bottom: 0.3 })
    expect(top).toBeGreaterThan(0.12)
    expect(bottom).toBeLessThan(0.7)
  })

  it('never grows past the size it has without a sheet', () => {
    const plain = inspectFrame({ fov: FOV, aspect: 0.62, height: 0.2, depth: 0.13 })
    const small = inspectFrame({ fov: FOV, aspect: 0.62, height: 0.2, depth: 0.13, bottom: 0.05 })
    expect(small.distance).toBeCloseTo(plain.distance)
  })

  it('backs off until a wide front fits the view width', () => {
    const frame = inspectFrame({ fov: FOV, aspect: 0.4, height: 0.2, depth: 0.2 })
    const width = 0.2 / (2 * frame.distance * tan * 0.4)
    expect(width).toBeLessThanOrEqual(0.8 + 1e-9)
  })
})

describe('stageInsets', () => {
  const stage = { stageTop: 91, stageBottom: 851, viewportHeight: 915, band: 0 }

  it('covers the stage from the sheet\'s top edge down, the sheet being on the viewport\'s bottom edge', () => {
    expect(stageInsets({ ...stage, sheetTop: 540 })).toEqual({ top: 0, bottom: 311 })
  })

  it('counts what the viewport cuts off: the stage above its top, below its bottom', () => {
    expect(stageInsets({ ...stage, stageTop: -40, stageBottom: 720, sheetTop: null })).toEqual({ top: 40, bottom: 0 })
    expect(stageInsets({ ...stage, stageBottom: 1000, sheetTop: null })).toEqual({ top: 0, bottom: 85 })
  })

  it('takes the stage\'s own top band where it is lower than the viewport\'s edge', () => {
    expect(stageInsets({ ...stage, band: 60, sheetTop: 600 })).toEqual({ top: 60, bottom: 251 })
  })

  it('never covers more than the stage', () => {
    expect(stageInsets({ ...stage, sheetTop: 0 })).toEqual({ top: 0, bottom: 760 })
    expect(stageInsets({ ...stage, stageBottom: stage.stageTop, sheetTop: 500 })).toEqual({ top: 0, bottom: 0 })
  })
})

describe('sheetMaxHeight', () => {
  it('reaches SHEET_SHARE up the stage, plus what lies between the stage and the viewport\'s bottom', () => {
    expect(sheetMaxHeight({ stageHeight: 700, stageBottom: 800, viewportHeight: 900 })).toBe(Math.round(700 * SHEET_SHARE + 100))
    expect(sheetMaxHeight({ stageHeight: 700, stageBottom: 950, viewportHeight: 900 })).toBe(Math.round(700 * SHEET_SHARE))
  })
})

describe('showsSheet', () => {
  it('shows the sheet on narrow stages only, the card until measured', () => {
    expect(showsSheet(0)).toBe(false)
    expect(showsSheet(412)).toBe(true)
    expect(showsSheet(SHEET_MAX_WIDTH)).toBe(true)
    expect(showsSheet(SHEET_MAX_WIDTH + 1)).toBe(false)
  })
})

describe('settleDrag', () => {
  it('springs back from a tap or a short drag', () => {
    expect(settleDrag({ dy: 2, velocity: 0.01, height: 160 })).toBe('stay')
    expect(settleDrag({ dy: 30, velocity: 0.1, height: 160 })).toBe('stay')
  })

  it('puts the Book back on a long or fast drag down', () => {
    expect(settleDrag({ dy: 80, velocity: 0.1, height: 160 })).toBe('dismiss')
    expect(settleDrag({ dy: 20, velocity: 0.8, height: 160 })).toBe('dismiss')
  })

  it('asks a tall sheet for no more than DISMISS_MAX of drag', () => {
    expect(settleDrag({ dy: 125, velocity: 0.1, height: 600 })).toBe('dismiss')
  })

  it('springs back from a drag down flicked back up', () => {
    expect(settleDrag({ dy: 90, velocity: -0.8, height: 160 })).toBe('stay')
  })
})

describe('dragOffset', () => {
  it('follows the finger down and gives at most RUBBER px up', () => {
    expect(dragOffset(40)).toBe(40)
    expect(dragOffset(-10)).toBeLessThan(0)
    expect(dragOffset(-10)).toBeGreaterThan(-10)
    expect(dragOffset(-1000)).toBeGreaterThan(-RUBBER)
  })
})
