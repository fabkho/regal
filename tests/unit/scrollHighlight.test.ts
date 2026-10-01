import { describe, expect, it } from 'vitest'
import {
  approach,
  bell,
  easeRate,
  FOCUS,
  lineDistance,
  liftFor,
  nearestBook,
  RIFFLE,
  SCROLL_HIGHLIGHTS,
  targetAmount,
  WAVE,
  waveLevel,
} from '../../app/utils/stack/scrollHighlight'
import type { Lift } from '../../app/utils/stack/scrollHighlight'

const pile = [
  { bookId: 'top', y: 0.15, thickness: 0.03 },
  { bookId: 'middle', y: 0.11, thickness: 0.05 },
  { bookId: 'bottom', y: 0.07, thickness: 0.03 },
]
const lift = (): Lift => ({ out: 0, slide: 0, tilt: 0, yaw: 0, shine: 0 })

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

describe('waveLevel', () => {
  it('is 0 at rest, full from the full speed on, either direction', () => {
    expect(waveLevel(0)).toBe(0)
    expect(waveLevel(WAVE.fullSpeed)).toBe(1)
    expect(waveLevel(-3)).toBe(1)
    expect(waveLevel(WAVE.fullSpeed / 2)).toBeCloseTo(0.5)
    expect(waveLevel(0.1)).toBeLessThan(waveLevel(0.2))
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
  it('focus: only the Book on the line, fully', () => {
    expect(targetAmount('focus', 0, true, 0, 0)).toBe(1)
    expect(targetAmount('focus', 0.01, false, 1, 2)).toBe(0)
  })

  it('wave: grows with the scroll speed and settles to a small rest on the focused Book', () => {
    expect(targetAmount('wave', 0.02, false, 0, 0)).toBe(0)
    expect(targetAmount('wave', 0, true, 0, 0)).toBe(WAVE.rest)
    const slow = targetAmount('wave', 0, false, waveLevel(0.1), 0.1)
    const fast = targetAmount('wave', 0, false, waveLevel(0.4), 0.4)
    expect(fast).toBeGreaterThan(slow)
    expect(targetAmount('wave', WAVE.radius * 2, false, 1, 0)).toBe(0)
  })

  it('wave: the crest trails the line (below it while moving up)', () => {
    const speed = 0.5
    const below = targetAmount('wave', -0.03, false, 1, speed)
    const above = targetAmount('wave', 0.03, false, 1, speed)
    expect(below).toBeGreaterThan(above)
    expect(targetAmount('wave', -speed * WAVE.lag, false, 1, speed)).toBeCloseTo(1)
  })

  it('riffle: by distance alone, the centred Book most', () => {
    expect(targetAmount('riffle', 0, false, 0, 0)).toBe(1)
    expect(targetAmount('riffle', 0.02, false, 0, 0)).toBeGreaterThan(targetAmount('riffle', 0.04, false, 0, 0))
    expect(targetAmount('riffle', RIFFLE.radius, false, 1, 1)).toBe(0)
  })
})

describe('approach', () => {
  it('eases towards the target and snaps when close', () => {
    const next = approach(0, 1, 12, 1 / 60)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(1)
    expect(approach(0.9995, 1, 12, 1 / 60)).toBe(1)
    expect(approach(0.5, 0, 12, 10)).toBe(0)
  })

  it('the wave rises faster than it settles', () => {
    expect(easeRate('wave', true)).toBeGreaterThan(easeRate('wave', false))
    expect(easeRate('focus', true)).toBe(easeRate('focus', false))
  })
})

describe('liftFor', () => {
  it('focus moves like hover', () => {
    const into = lift()
    expect(liftFor('focus', 1, false, into)).toBe(into)
    expect(into).toEqual({ out: FOCUS.out, slide: 0, tilt: FOCUS.tilt, yaw: 0, shine: 1 })
  })

  it('wave draws sideways, riffle turns', () => {
    expect(liftFor('wave', 0.5, false, lift())).toMatchObject({ out: WAVE.out / 2, slide: WAVE.slide / 2, yaw: 0, shine: 0.5 })
    expect(liftFor('riffle', 1, false, lift())).toMatchObject({ yaw: RIFFLE.yaw, slide: 0, shine: 1 })
  })

  it('reduced motion keeps the shine only', () => {
    for (const { value } of SCROLL_HIGHLIGHTS) {
      expect(liftFor(value, 1, true, lift())).toEqual({ out: 0, slide: 0, tilt: 0, yaw: 0, shine: 1 })
    }
  })
})
