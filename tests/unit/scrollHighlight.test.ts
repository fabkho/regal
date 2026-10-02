import { describe, expect, it } from 'vitest'
import {
  approach,
  bell,
  focusLine,
  lineDistance,
  liftFor,
  nearestBook,
  RIFFLE,
  targetAmount,
} from '../../app/utils/stack/scrollHighlight'
import type { Lift } from '../../app/utils/stack/scrollHighlight'

const pile = [
  { bookId: 'top', y: 0.15, thickness: 0.03 },
  { bookId: 'middle', y: 0.11, thickness: 0.05 },
  { bookId: 'bottom', y: 0.07, thickness: 0.03 },
]
const lift = (): Lift => ({ out: 0, tilt: 0, yaw: 0, shine: 0 })

describe('bell', () => {
  it('is 1 on the line, 0 from the radius on, symmetric and falling in between', () => {
    expect(bell(0, 0.1)).toBe(1)
    expect(bell(0.1, 0.1)).toBe(0)
    expect(bell(-0.2, 0.1)).toBe(0)
    expect(bell(0.05, 0.1)).toBeCloseTo(0.5)
    expect(bell(-0.03, 0.1)).toBeCloseTo(bell(0.03, 0.1))
    expect(bell(0.02, 0.1)).toBeGreaterThan(bell(0.04, 0.1))
  })
})

describe('nearestBook', () => {
  it('finds the Book the focus line crosses', () => {
    expect(nearestBook(pile, 0.12, null)).toBe(1)
    expect(nearestBook(pile, 0.16, null)).toBe(0)
    // Below the pile: the nearest one.
    expect(nearestBook(pile, 0, null)).toBe(2)
    expect(nearestBook([], 0.1, null)).toBe(-1)
  })

  it('measures from the Book\'s faces, so a thick Book is crossed over its whole thickness', () => {
    expect(lineDistance(pile[1]!, 0.13)).toBe(0)
    expect(lineDistance(pile[1]!, 0.14)).toBeCloseTo(0.005)
  })

  it('keeps the current Book until another is clearly nearer (no flicker on a boundary)', () => {
    // Just past the middle Book's top face: the top Book is crossed, middle 1 mm away.
    expect(nearestBook(pile, 0.1365, 'middle')).toBe(1)
    expect(nearestBook(pile, 0.1365, null)).toBe(0)
    // Well into the top Book: it takes over.
    expect(nearestBook(pile, 0.145, 'middle')).toBe(0)
  })

  it('drops a current Book that is no longer in the pile', () => {
    expect(nearestBook(pile, 0.07, 'gone')).toBe(2)
  })
})

describe('targetAmount', () => {
  it('by distance alone, the centred Book most', () => {
    expect(targetAmount(0)).toBe(1)
    expect(targetAmount(0.02)).toBeGreaterThan(targetAmount(0.04))
    expect(targetAmount(-0.02)).toBeCloseTo(targetAmount(0.02))
    expect(targetAmount(RIFFLE.radius)).toBe(0)
  })
})

describe('approach', () => {
  it('eases towards the target and snaps when close', () => {
    const next = approach(0, 1, RIFFLE.rate, 1 / 60)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(1)
    expect(approach(0.9995, 1, RIFFLE.rate, 1 / 60)).toBe(1)
    expect(approach(0.5, 0, RIFFLE.rate, 10)).toBe(0)
  })
})

describe('liftFor', () => {
  it('turns the Book about its left end, with a little pull-out and tilt', () => {
    const into = lift()
    expect(liftFor(1, false, into)).toBe(into)
    expect(into).toEqual({ out: RIFFLE.out, tilt: RIFFLE.tilt, yaw: RIFFLE.yaw, shine: 1 })
    expect(liftFor(0.5, false, lift())).toMatchObject({ yaw: RIFFLE.yaw / 2, shine: 0.5 })
  })

  it('reduced motion keeps the shine only', () => {
    expect(liftFor(1, true, lift())).toEqual({ out: 0, tilt: 0, yaw: 0, shine: 1 })
  })
})

describe('focusLine', () => {
  const bounds = [0.3, 2] as const
  const ends = [0.015, 2.04] as const
  it('is the middle of the view away from the ends', () => {
    expect(focusLine(1, bounds, ends)).toBe(1)
  })
  it('reaches the end Books at the scroll bounds', () => {
    expect(focusLine(0.3, bounds, ends)).toBeCloseTo(0.015)
    expect(focusLine(2, bounds, ends)).toBeCloseTo(2.04)
  })
  it('rises with the view, so scrolling passes every Book in order', () => {
    let last = -Infinity
    for (let y = 0.3; y <= 2; y += 0.01) {
      const line = focusLine(y, bounds, ends)
      expect(line).toBeGreaterThan(last)
      last = line
    }
  })
  it('leaves a pile shorter than the view alone', () => {
    expect(focusLine(0.3, [0.3, 0.3], ends)).toBe(0.3)
  })
})
