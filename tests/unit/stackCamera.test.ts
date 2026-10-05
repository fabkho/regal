import { describe, expect, it } from 'vitest'
import { MathUtils } from 'three'
import { TOP_AT_NARROW, topAt, viewForTop } from '../../app/utils/stack/camera'

const FOV = 34
const DISTANCE = 1.15
const RISE = 0.22

/** Where a point at height y lands in the view, -1 (bottom) to 1 (top), for a camera looking at `look`. */
function ndcY(y: number, look: number, distance = DISTANCE, rise = RISE) {
  const axis = Math.atan(rise / distance)
  const point = Math.atan((look + rise - y) / distance)
  return Math.tan(axis - point) / Math.tan(MathUtils.degToRad(FOV) / 2)
}

describe('topAt', () => {
  it('keeps wide views as they were and starts tall ones high', () => {
    expect(topAt(1.6)).toBe(0)
    expect(topAt(1)).toBe(0)
    expect(topAt(0.45)).toBe(TOP_AT_NARROW)
    expect(topAt(0.7)).toBe(TOP_AT_NARROW)
  })

  it('eases in between and ignores an unknown size', () => {
    expect(topAt(0.85)).toBeCloseTo(TOP_AT_NARROW / 2)
    expect(topAt(0.9)).toBeGreaterThan(0)
    expect(topAt(0.9)).toBeLessThan(topAt(0.8))
    expect(topAt(0)).toBe(0)
    expect(topAt(Number.NaN)).toBe(0)
  })
})

describe('viewForTop', () => {
  it('looks at the top itself when it belongs mid-view', () => {
    expect(viewForTop(0.9, 0, DISTANCE, RISE, FOV)).toBeCloseTo(0.9)
  })

  it('puts the top where asked, at any zoom', () => {
    for (const at of [0.3, 0.6, 0.8]) {
      for (const zoom of [1, 1.4]) {
        const look = viewForTop(0.9, at, DISTANCE * zoom, RISE * zoom, FOV)
        expect(ndcY(0.9, look, DISTANCE * zoom, RISE * zoom)).toBeCloseTo(at)
      }
    }
  })

  it('looks lower the higher the top should show', () => {
    expect(viewForTop(0.9, 0.6, DISTANCE, RISE, FOV)).toBeLessThan(viewForTop(0.9, 0.3, DISTANCE, RISE, FOV))
  })
})
