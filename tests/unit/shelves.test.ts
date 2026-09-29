import { describe, expect, it } from 'vitest'
import {
  BAY_COUNT,
  BOOKCASE_SCALE,
  BOOKCASE_SIZE,
  MAX_BOOK_HEIGHT,
  SHELF_COUNT,
  SHELF_DEPTH,
  SHELF_SLOTS,
} from '../../app/utils/bookcase/shelves'

describe('measured shelf data', () => {
  it('has one slot per bay per shelf', () => {
    expect(BAY_COUNT).toBe(4)
    expect(SHELF_COUNT).toBe(6)
    expect(SHELF_SLOTS).toHaveLength(BAY_COUNT * SHELF_COUNT)
    const keys = SHELF_SLOTS.map(slot => `${slot.shelf}/${slot.bay}`)
    expect(new Set(keys).size).toBe(SHELF_SLOTS.length)
  })

  it('scales the model to a 2.4 m Bookcase', () => {
    expect(BOOKCASE_SCALE).toBeGreaterThan(0)
    expect(BOOKCASE_SIZE.height).toBeCloseTo(2.4, 3)
    expect(BOOKCASE_SIZE.width).toBeGreaterThan(BOOKCASE_SIZE.depth)
  })

  it('is ordered top to bottom, left to right', () => {
    const order = SHELF_SLOTS.map(slot => [slot.shelf, slot.bay])
    expect(order).toEqual(
      Array.from({ length: SHELF_COUNT }, (_, shelf) =>
        Array.from({ length: BAY_COUNT }, (_, bay) => [shelf, bay])).flat(),
    )

    for (const slot of SHELF_SLOTS) {
      const above = SHELF_SLOTS.find(other => other.bay === slot.bay && other.shelf === slot.shelf - 1)
      if (above) expect(above.y).toBeGreaterThan(slot.y)
      const left = SHELF_SLOTS.find(other => other.shelf === slot.shelf && other.bay === slot.bay - 1)
      if (left) expect(left.xEnd).toBeLessThanOrEqual(slot.xStart)
    }
  })

  it('has positive, plausible dimensions', () => {
    for (const slot of SHELF_SLOTS) {
      expect(slot.xEnd - slot.xStart).toBeGreaterThan(0.2)
      expect(slot.zFront - slot.zBack).toBeGreaterThan(0.1)
      expect(slot.clearance).toBeGreaterThan(0.2)
      // A shelf full of hardcovers must not reach the board above.
      expect(slot.clearance).toBeLessThan(0.5)
    }
    expect(MAX_BOOK_HEIGHT).toBe(Math.min(...SHELF_SLOTS.map(slot => slot.clearance)))
    expect(SHELF_DEPTH).toBe(Math.min(...SHELF_SLOTS.map(slot => slot.zFront - slot.zBack)))
  })

  it('keeps every slot inside the Bookcase bounds', () => {
    const halfWidth = BOOKCASE_SIZE.width / 2
    for (const slot of SHELF_SLOTS) {
      expect(slot.xStart).toBeGreaterThanOrEqual(-halfWidth)
      expect(slot.xEnd).toBeLessThanOrEqual(halfWidth)
      expect(slot.y).toBeGreaterThan(0)
      expect(slot.y + slot.clearance).toBeLessThanOrEqual(BOOKCASE_SIZE.height)
      expect(slot.zBack).toBeGreaterThanOrEqual(0)
      expect(slot.zFront).toBeLessThanOrEqual(BOOKCASE_SIZE.depth)
    }
  })

  it('has no overlapping slots', () => {
    const overlaps1d = (a: [number, number], b: [number, number]) => a[0] < b[1] - 1e-6 && b[0] < a[1] - 1e-6
    for (const [index, slot] of SHELF_SLOTS.entries()) {
      for (const other of SHELF_SLOTS.slice(index + 1)) {
        const sameColumn = overlaps1d([slot.xStart, slot.xEnd], [other.xStart, other.xEnd])
        const sameLevel = overlaps1d(
          [slot.y, slot.y + slot.clearance],
          [other.y, other.y + other.clearance],
        )
        expect(sameColumn && sameLevel).toBe(false)
      }
    }
  })

  it('is symmetric about x = 0', () => {
    for (const slot of SHELF_SLOTS) {
      const mirrored = SHELF_SLOTS.find(
        other => other.shelf === slot.shelf && other.bay === BAY_COUNT - 1 - slot.bay,
      )!
      expect(mirrored.xStart).toBeCloseTo(-slot.xEnd, 3)
      expect(mirrored.xEnd).toBeCloseTo(-slot.xStart, 3)
    }
  })
})
