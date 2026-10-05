import { describe, expect, it } from 'vitest'
import {
  clampSpeed,
  GLIDE_MAX_SPEED,
  GLIDE_TAU,
  glideStep,
  HOLD_STILL,
  longestGlide,
  releaseSpeed,
  startGlide,
  STOP_SPEED,
  TOUCH_DIRECT,
  TOUCH_FEEL,
  TOUCH_GAIN,
  TOUCH_LIMITS,
  trackTouch,
  tunedFeel,
  VELOCITY_WINDOW,
} from '../../app/utils/stack/touchScroll'
import type { Glide, TouchSample } from '../../app/utils/stack/touchScroll'

/** A finger moving at `pxPerSecond` for `ms`, sampled every 16 ms. */
function swipe(pxPerSecond: number, ms: number, start = 0): TouchSample[] {
  const samples: TouchSample[] = []
  for (let t = 0; t <= ms; t += 16) trackTouch(samples, start + t, pxPerSecond * t / 1000)
  return samples
}

/** Runs a glide to its end at 60 fps; returns the distance covered. */
function glideOut(glide: Glide, tau: number) {
  let distance = 0
  for (let frame = 0; glide.speed !== 0 && frame < 10_000; frame++) distance += glideStep(glide, tau, 1 / 60)
  return distance
}

describe('TOUCH_FEEL', () => {
  it('is the feel chosen on a Pixel 8 Pro: two thirds of the finger, direct, a short capped glide', () => {
    expect(TOUCH_GAIN).toBe(0.65)
    expect(TOUCH_DIRECT).toBe(true)
    expect(GLIDE_TAU).toBe(0.25)
    expect(GLIDE_MAX_SPEED).toBe(0.55)
    expect(TOUCH_FEEL).toEqual({ gain: 0.65, direct: true, glideTau: 0.25, maxSpeed: 0.55 })
    expect(Object.isFrozen(TOUCH_FEEL)).toBe(true)
  })

  it('moves the pile slower than the finger: half as far as the first feel (2.2 mm/px ≈ 1.3× a phone finger)', () => {
    expect(TOUCH_FEEL.gain).toBeLessThan(1)
    expect(TOUCH_FEEL.gain).toBeCloseTo(1.3 / 2)
  })

  it('lets a flick carry the pile at most ~0.14 m, a handful of Books', () => {
    expect(longestGlide(TOUCH_FEEL)).toBeCloseTo(0.1375)
    const hard = startGlide(TOUCH_FEEL, 5)
    expect(glideOut(hard, TOUCH_FEEL.glideTau)).toBeLessThanOrEqual(longestGlide(TOUCH_FEEL))
  })

  it('is mostly over within half a second, and fully stopped by about 1.3 s', () => {
    const glide = startGlide(TOUCH_FEEL, 5)
    let covered = 0
    for (let frame = 0; frame < 30; frame++) covered += glideStep(glide, TOUCH_FEEL.glideTau, 1 / 60)
    // 86 % after 2τ = 0.5 s: what is left is a creep of under 2 cm.
    expect(covered / longestGlide(TOUCH_FEEL)).toBeGreaterThan(0.85)
    expect(longestGlide(TOUCH_FEEL) - covered).toBeLessThan(0.02)
    let seconds = 0.5
    while (glide.speed !== 0) {
      glideStep(glide, TOUCH_FEEL.glideTau, 1 / 60)
      seconds += 1 / 60
    }
    expect(seconds).toBeLessThan(1.4)
  })
})

describe('tunedFeel (dev server only)', () => {
  it('is TOUCH_FEEL itself without tuning parameters', () => {
    expect(tunedFeel({})).toBe(TOUCH_FEEL)
    expect(tunedFeel({ touch: 'a', view: 'stack' })).toBe(TOUCH_FEEL)
  })

  it('tunes single parameters and leaves the rest', () => {
    expect(tunedFeel({ glide: '0.15' })).toEqual({ ...TOUCH_FEEL, glideTau: 0.15 })
    expect(tunedFeel({ gain: '0.8', cap: '0.3', follow: 'eased' })).toEqual({ ...TOUCH_FEEL, gain: 0.8, maxSpeed: 0.3, direct: false })
    expect(TOUCH_FEEL.glideTau).toBe(GLIDE_TAU)
  })

  it('clamps to sane limits and ignores what is not a number', () => {
    expect(tunedFeel({ gain: '50' }).gain).toBe(TOUCH_LIMITS.gain[1])
    expect(tunedFeel({ glide: '0' }).glideTau).toBe(TOUCH_LIMITS.glide[0])
    expect(tunedFeel({ cap: 'fast' })).toBe(TOUCH_FEEL)
    expect(tunedFeel({ gain: '', follow: 'wobbly' })).toBe(TOUCH_FEEL)
    expect(tunedFeel({ gain: ['0.5'] })).toBe(TOUCH_FEEL)
  })
})

describe('releaseSpeed', () => {
  it('is the finger speed over the last moments', () => {
    const samples = swipe(1200, 300)
    expect(releaseSpeed(samples, samples.at(-1)!.t + 5)).toBeCloseTo(1200, 0)
    expect(releaseSpeed(swipe(-600, 300), 300)).toBeCloseTo(-600, 0)
  })

  it('only remembers the last VELOCITY_WINDOW ms', () => {
    const samples = swipe(1000, 600)
    expect(samples.at(-1)!.t - samples[0]!.t).toBeLessThanOrEqual(VELOCITY_WINDOW)
  })

  it('is 0 for a finger that rested before lifting, or never moved', () => {
    const samples = swipe(1500, 200)
    expect(releaseSpeed(samples, samples.at(-1)!.t + HOLD_STILL + 1)).toBe(0)
    expect(releaseSpeed([{ t: 0, y: 0 }], 10)).toBe(0)
    expect(releaseSpeed([], 0)).toBe(0)
  })
})

describe('startGlide', () => {
  it('caps the speed so the riffle keeps up', () => {
    expect(startGlide(TOUCH_FEEL, 4).speed).toBe(GLIDE_MAX_SPEED)
    expect(startGlide(TOUCH_FEEL, -4).speed).toBe(-GLIDE_MAX_SPEED)
    expect(startGlide(TOUCH_FEEL, 0.2).speed).toBe(0.2)
    expect(clampSpeed(0.2, 0.5)).toBe(0.2)
  })

  it('does not glide on a released finger that barely moved', () => {
    expect(startGlide(TOUCH_FEEL, STOP_SPEED / 2).speed).toBe(0)
  })
})

describe('glideStep', () => {
  it('covers start speed × τ in total, slowing all the way, then stops', () => {
    const glide: Glide = { speed: 0.5 }
    let last = Infinity
    let distance = 0
    while (glide.speed !== 0) {
      const step = glideStep(glide, GLIDE_TAU, 1 / 60)
      expect(step).toBeLessThan(last)
      last = step
      distance += step
    }
    expect(distance).toBeCloseTo(0.5 * GLIDE_TAU, 2)
  })

  it('is frame-rate independent: 120 fps covers the same ground as 30 fps', () => {
    const at = (fps: number) => {
      const glide: Glide = { speed: -0.5 }
      let distance = 0
      for (let frame = 0; frame < fps / 2; frame++) distance += glideStep(glide, GLIDE_TAU, 1 / fps)
      return distance
    }
    expect(at(120)).toBeCloseTo(at(30), 4)
  })

  it('does nothing once stopped', () => {
    expect(glideStep({ speed: 0 }, GLIDE_TAU, 1 / 60)).toBe(0)
  })
})
