import { describe, expect, it } from 'vitest'
import { INSPECT_ASIDE, INSPECT_FILL, INSPECT_LIFT, inspectFrame } from '../../app/utils/books/inspect'
import { dragOffset, resolveSheetVariant, RUBBER, settleDrag, SHEET_MAX_WIDTH } from '../../app/utils/books/sheet'

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

describe('resolveSheetVariant', () => {
  it('shows the card on wide or unmeasured stages', () => {
    expect(resolveSheetVariant('a', 0)).toBeNull()
    expect(resolveSheetVariant('a', SHEET_MAX_WIDTH + 1)).toBeNull()
  })

  it('reads ?sheet, defaulting to a', () => {
    expect(resolveSheetVariant(undefined, 412)).toBe('a')
    expect(resolveSheetVariant('b', 412)).toBe('b')
    expect(resolveSheetVariant(['C'], 412)).toBe('c')
    expect(resolveSheetVariant('zzz', 412)).toBe('a')
    expect(resolveSheetVariant('off', 412)).toBeNull()
  })
})

describe('settleDrag', () => {
  const base = { height: 160, expandable: true, expanded: false }

  it('tells a tap from a drag', () => {
    expect(settleDrag({ ...base, dy: 2, velocity: 0.01 })).toBe('tap')
    expect(settleDrag({ ...base, dy: 2, velocity: 1 })).toBe('dismiss')
  })

  it('puts the Book back on a long or fast drag down, closes an open sheet first', () => {
    expect(settleDrag({ ...base, dy: 80, velocity: 0.1 })).toBe('dismiss')
    expect(settleDrag({ ...base, dy: 20, velocity: 0.8 })).toBe('dismiss')
    expect(settleDrag({ ...base, expanded: true, dy: 125, velocity: 0.1 })).toBe('collapse')
    // A tall open sheet doesn't ask for a drag of a third of its height.
    expect(settleDrag({ ...base, height: 600, expanded: true, dy: 125, velocity: 0.1 })).toBe('collapse')
  })

  it('springs back from a short drag, or a drag down flicked back up', () => {
    expect(settleDrag({ ...base, dy: 30, velocity: 0.1 })).toBe('stay')
    expect(settleDrag({ ...base, dy: 90, velocity: -0.8 })).toBe('expand')
    expect(settleDrag({ ...base, expandable: false, dy: 90, velocity: -0.8 })).toBe('stay')
  })

  it('opens a compact sheet on a drag up', () => {
    expect(settleDrag({ ...base, dy: -50, velocity: 0 })).toBe('expand')
    expect(settleDrag({ ...base, expanded: true, dy: -50, velocity: 0 })).toBe('stay')
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
