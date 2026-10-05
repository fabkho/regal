import { describe, expect, it } from 'vitest'
import {
  ASSUME_STOPPED,
  boostFling,
  dragAxis,
  flingAt,
  followed,
  MAX_FLING_SPEED,
  MIN_FLING_SPEED,
  releaseVelocity,
  ROW_TOUCH_SLOP,
  startFling,
  trackDrag,
  VELOCITY_HORIZON,
} from '../../app/utils/row/touchDrag'
import type { DragSample } from '../../app/utils/row/touchDrag'

/** A finger moving at `speed` px/s, a sample every `step` ms over `ms`. */
function finger(speed: number, ms = 200, step = 8): DragSample[] {
  const samples: DragSample[] = []
  for (let t = 0; t <= ms; t += step) trackDrag(samples, t, 100 + speed * t / 1000)
  return samples
}

describe('dragAxis / followed (the slop)', () => {
  it('waits inside the slop, then takes the stronger axis', () => {
    expect(dragAxis(3, 4)).toBe('pending')
    expect(dragAxis(ROW_TOUCH_SLOP + 1, 2)).toBe('x')
    expect(dragAxis(-12, -3)).toBe('x')
    expect(dragAxis(3, ROW_TOUCH_SLOP + 2)).toBe('y')
  })

  it('follows the finger 1:1 past the slop, the slop left out (no jump)', () => {
    expect(followed(ROW_TOUCH_SLOP)).toBe(0)
    expect(followed(ROW_TOUCH_SLOP + 20)).toBe(20)
    expect(followed(-(ROW_TOUCH_SLOP + 20))).toBe(-20)
    expect(followed(2)).toBe(0)
  })
})

describe('releaseVelocity', () => {
  it('is the finger\'s speed at release (px/s)', () => {
    const samples = finger(1200)
    expect(releaseVelocity(samples, samples.at(-1)!.t)).toBeCloseTo(1200, 6)
    const back = finger(-800)
    expect(releaseVelocity(back, back.at(-1)!.t + 5)).toBeCloseTo(-800, 6)
  })

  it('only counts the last VELOCITY_HORIZON ms', () => {
    const samples: DragSample[] = []
    for (let t = 0; t <= 300; t += 8) trackDrag(samples, t, t < 150 ? t * 5 : 750 + (t - 150) * 0.5)
    expect(samples[0]!.t).toBeGreaterThanOrEqual(300 - VELOCITY_HORIZON - 8)
    expect(releaseVelocity(samples, 300)).toBeCloseTo(500, 0)
  })

  it('is 0 for a finger held still before lifting, or one that barely moved', () => {
    const samples = finger(1500)
    expect(releaseVelocity(samples, samples.at(-1)!.t + ASSUME_STOPPED + 1)).toBe(0)
    expect(releaseVelocity([{ t: 0, x: 10 }], 0)).toBe(0)
    expect(releaseVelocity([], 0)).toBe(0)
  })

  it('takes the last two positions when a slow frame left only sparse ones', () => {
    expect(releaseVelocity([{ t: 0, x: 0 }, { t: 240, x: 240 }], 240)).toBeCloseTo(1000, 6)
    expect(releaseVelocity([{ t: 0, x: 0 }, { t: 400, x: 240 }], 400)).toBe(0)
  })
})

describe('the fling (Android\'s Scroller curve)', () => {
  it('needs a minimum speed and caps at the maximum', () => {
    expect(startFling(MIN_FLING_SPEED - 1)).toBeNull()
    expect(startFling(-(MIN_FLING_SPEED - 1))).toBeNull()
    expect(startFling(MAX_FLING_SPEED * 3)!.velocity).toBe(MAX_FLING_SPEED)
    expect(startFling(-MAX_FLING_SPEED * 3)!.velocity).toBe(-MAX_FLING_SPEED)
  })

  it('goes further and longer the faster the flick, in its direction', () => {
    const slow = startFling(800)!
    const fast = startFling(3000)!
    expect(fast.distance).toBeGreaterThan(slow.distance)
    expect(fast.duration).toBeGreaterThan(slow.duration)
    expect(startFling(-3000)!.distance).toBeCloseTo(-fast.distance, 9)
    // Android's numbers (DIPs): a 2000 px/s fling runs about 650 px in under a second.
    const typical = startFling(2000)!
    expect(typical.distance).toBeGreaterThan(600)
    expect(typical.distance).toBeLessThan(700)
    expect(typical.duration).toBeGreaterThan(850)
    expect(typical.duration).toBeLessThan(1000)
  })

  it('starts at its speed, slows down monotonically and stops where it said', () => {
    const fling = startFling(2500)!
    let last = 0
    let lastSpeed = Infinity
    for (let t = 0; t < fling.duration; t += 16) {
      const at = flingAt(fling, t)
      expect(at.offset).toBeGreaterThanOrEqual(last - 1e-9)
      expect(Math.abs(at.velocity)).toBeLessThanOrEqual(lastSpeed + 1e-6)
      last = at.offset
      lastSpeed = Math.abs(at.velocity)
    }
    expect(flingAt(fling, 0).offset).toBeCloseTo(0, 1)
    // The spline starts close to the release speed (Android's own curve starts a touch faster).
    expect(flingAt(fling, 0).velocity / 2500).toBeGreaterThan(0.9)
    expect(flingAt(fling, 0).velocity / 2500).toBeLessThan(1.3)
    const end = flingAt(fling, fling.duration)
    expect(end).toEqual({ offset: fling.distance, velocity: 0, done: true })
  })

  it('boosts a flick in the same direction while the last one still glides', () => {
    expect(boostFling(1500, 900)).toBe(2400)
    expect(boostFling(-1500, -900)).toBe(-2400)
    expect(boostFling(1500, -900)).toBe(1500)
    expect(boostFling(1500, 0)).toBe(1500)
  })
})
