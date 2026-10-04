import { describe, expect, it } from 'vitest'
import {
  clampSpeed,
  glideStep,
  HOLD_STILL,
  releaseSpeed,
  snapView,
  startGlide,
  STOP_SPEED,
  TOUCH_FEELS,
  touchFeel,
  trackTouch,
  VELOCITY_WINDOW,
  viewFor,
} from '../../app/utils/stack/touchScroll'
import type { Glide, TouchSample } from '../../app/utils/stack/touchScroll'
import { focusLine } from '../../app/utils/stack/scrollHighlight'

/** A finger moving at `pxPerSecond` for `ms`, sampled every 16 ms. */
function swipe(pxPerSecond: number, ms: number, start = 0): TouchSample[] {
  const samples: TouchSample[] = []
  for (let t = 0; t <= ms; t += 16) trackTouch(samples, start + t, pxPerSecond * t / 1000)
  return samples
}

/** Runs a glide to its end at 60 fps; returns the distance covered and the frames it took. */
function glideOut(glide: Glide, tau: number) {
  let distance = 0
  let frames = 0
  while (glide.speed !== 0 && frames < 10_000) {
    distance += glideStep(glide, tau, 1 / 60)
    frames++
  }
  return { distance, frames }
}

describe('touchFeel', () => {
  it('reads ?touch=a|b|c and keeps the first feel for anything else', () => {
    expect(touchFeel('a')).toBe(TOUCH_FEELS.a)
    expect(touchFeel('c')).toBe(TOUCH_FEELS.c)
    expect(touchFeel('z')).toBeNull()
    expect(touchFeel(undefined)).toBeNull()
    expect(touchFeel(['a'])).toBeNull()
  })

  it('caps every glide well below the first feel (2× the finger, flicks at full speed)', () => {
    for (const feel of Object.values(TOUCH_FEELS)) {
      expect(feel.gain).toBeLessThanOrEqual(1)
      expect(feel.maxSpeed).toBeLessThanOrEqual(1.2)
    }
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

describe('glideStep', () => {
  it('covers start speed × τ in total, slowing all the way, then stops', () => {
    const glide: Glide = { speed: 0.8, rest: null }
    let last = Infinity
    let distance = 0
    while (glide.speed !== 0) {
      const step = glideStep(glide, 0.35, 1 / 60)
      expect(step).toBeLessThan(last)
      last = step
      distance += step
    }
    expect(distance).toBeCloseTo(0.8 * 0.35, 2)
  })

  it('is frame-rate independent: 120 fps covers the same ground as 30 fps', () => {
    const at = (fps: number) => {
      const glide: Glide = { speed: -0.6, rest: null }
      let distance = 0
      for (let frame = 0; frame < fps / 2; frame++) distance += glideStep(glide, 0.3, 1 / fps)
      return distance
    }
    expect(at(120)).toBeCloseTo(at(30), 4)
  })

  it('does nothing once stopped', () => {
    const glide: Glide = { speed: 0, rest: null }
    expect(glideStep(glide, 0.3, 1 / 60)).toBe(0)
  })
})

describe('startGlide', () => {
  const bounds: [number, number] = [0.1, 2]

  it('caps the speed so the riffle keeps up', () => {
    expect(startGlide(TOUCH_FEELS.b, 1, 4, bounds).speed).toBe(TOUCH_FEELS.b.maxSpeed)
    expect(startGlide(TOUCH_FEELS.b, 1, -4, bounds).speed).toBe(-TOUCH_FEELS.b.maxSpeed)
    expect(clampSpeed(0.2, 0.5)).toBe(0.2)
  })

  it('does not glide on a released finger that barely moved', () => {
    expect(startGlide(TOUCH_FEELS.a, 1, STOP_SPEED / 2, bounds).speed).toBe(0)
  })

  it('a snapping glide comes to rest exactly on the snapped view, from where a free one would', () => {
    const feel = TOUCH_FEELS.c
    const snapTo = (view: number) => Math.round(view / 0.03) * 0.03
    const glide = startGlide(feel, 1, 0.5, bounds, snapTo)
    const free = 1 + 0.5 * feel.glideTau
    expect(glide.rest).toBeCloseTo(snapTo(free))
    const { distance } = glideOut(glide, feel.glideTau)
    // The last bit below STOP_SPEED is the scene's to place (it sets the rest).
    expect(1 + distance).toBeCloseTo(glide.rest ?? Number.NaN, 2)
  })

  it('a snapping glide settles a slow release onto the nearest Book too', () => {
    const snapTo = (view: number) => Math.round(view / 0.03) * 0.03
    const glide = startGlide(TOUCH_FEELS.c, 1, 0, bounds, snapTo)
    expect(glide.rest).toBeCloseTo(0.99)
    expect(glide.speed).toBeLessThan(0)
  })

  it('never aims past the ends of the pile', () => {
    const snapTo = (view: number) => view + 0.5
    expect(startGlide(TOUCH_FEELS.c, 1.9, 0.7, bounds, snapTo).rest).toBe(2)
  })
})

describe('snapView / viewFor', () => {
  const bounds: [number, number] = [0.3, 1.8]
  const ends: [number, number] = [0.015, 1.985]
  const offset = 0.013
  const focusOf = (view: number) => focusLine(view, bounds, ends) + offset

  it('finds the view whose focus line is at a height, also where the line slides to the ends', () => {
    for (const focus of [0.4, 1, 1.5, 0.05, 1.95]) {
      const view = viewFor(focus, focusOf, bounds)
      expect(focusOf(view)).toBeCloseTo(focus, 6)
    }
    expect(viewFor(-1, focusOf, bounds)).toBe(0.3)
    expect(viewFor(5, focusOf, bounds)).toBe(1.8)
  })

  it('lands the focus line on the Book centre nearest to where the view rests', () => {
    const centres = [1.2, 1.17, 1.13, 1.1]
    const view = snapView(1.143 - offset, centres, focusOf, bounds)
    expect(focusOf(view)).toBeCloseTo(1.13, 6)
    expect(snapView(1, [], focusOf, bounds)).toBe(1)
  })
})
