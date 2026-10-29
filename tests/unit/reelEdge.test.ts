// How a Book comes in and goes out at the arc's edge (utils/reel/edge.ts, layout.ts `edge`): continuous with the
// arc's position, so it scrubs with a swipe; the shadow follows through the same number.
import { describe, expect, it } from 'vitest'
import { edgeLook, REEL_EDGE_DEFAULT, REEL_EDGES } from '../../app/utils/reel/edge'
import type { EdgeLook } from '../../app/utils/reel/edge'
import { REEL_EDGE_FROM, REEL_FADE_AT, reelPose } from '../../app/utils/reel/layout'

const look = (mode: Parameters<typeof edgeLook>[0], edge: number): EdgeLook => ({ ...edgeLook(mode, edge, { opacity: 0, scale: 0, sink: 0 }) })

describe('the edge of the arc (layout)', () => {
  it('every Book of an arc at rest is fully there; the edge is only between the last shown distance and the cut', () => {
    for (const n of [4, 5, 12, 300]) {
      for (let focus = 0; focus < Math.min(n, 6); focus++) {
        for (let index = 0; index < n; index++) {
          const pose = reelPose(index, focus, n)
          if (pose.opacity > 0) expect(pose.edge, `${n} ${focus} ${index}`).toBe(1)
        }
      }
    }
  })

  it('runs from 1 at REEL_EDGE_FROM to 0 at REEL_FADE_AT in the Book\'s distance, continuously and both ways', () => {
    const at = (distance: number) => reelPose(5, 5 - distance, 12).edge
    expect(at(REEL_EDGE_FROM)).toBe(1)
    expect(at(REEL_FADE_AT)).toBeCloseTo(0, 10)
    expect(at((REEL_EDGE_FROM + REEL_FADE_AT) / 2)).toBeCloseTo(0.5, 10)
    // Mirrored: left and right edges are the same.
    expect(reelPose(5, 5 + 2.4, 12).edge).toBeCloseTo(at(2.4), 10)
    // Scrubbing: a Book between the two stays between, monotone in the distance.
    const ramp = Array.from({ length: 30 }, (_, k) => at(REEL_EDGE_FROM + ((REEL_FADE_AT - REEL_EDGE_FROM) * k) / 29))
    expect(ramp.every((edge, k) => k === 0 || edge <= ramp[k - 1]! + 1e-12)).toBe(true)
    // Past the cut it is hidden, as before.
    expect(reelPose(5, 5 - 2.7, 12)).toMatchObject({ opacity: 0, edge: 0 })
    expect(reelPose(5, 5 - 2.55, 12)).toMatchObject({ opacity: 1 })
  })
})

describe('the three options (and none)', () => {
  it('fade: opacity follows the edge, nothing else changes', () => {
    expect(look('fade', 1)).toEqual({ opacity: 1, scale: 1, sink: 0 })
    expect(look('fade', 0)).toEqual({ opacity: 0, scale: 1, sink: 0 })
    const half = look('fade', 0.5)
    expect(half.opacity).toBeCloseTo(0.5, 10)
    expect(half.scale).toBe(1)
  })

  it('fadeScale (default): it also grows from 0.85', () => {
    expect(REEL_EDGE_DEFAULT).toBe('fadeScale')
    expect(look('fadeScale', 1)).toEqual({ opacity: 1, scale: 1, sink: 0 })
    expect(look('fadeScale', 0)).toEqual({ opacity: 0, scale: 0.85, sink: 0 })
    const half = look('fadeScale', 0.5)
    expect(half.scale).toBeGreaterThan(0.85)
    expect(half.scale).toBeLessThan(1)
  })

  it('sink: it also rises out of the floor, a little smaller, and settles at rest', () => {
    expect(look('sink', 1)).toEqual({ opacity: 1, scale: 1, sink: 0 })
    const gone = look('sink', 0)
    expect(gone.opacity).toBe(0)
    expect(gone.sink).toBe(28)
    expect(gone.scale).toBeCloseTo(0.92, 10)
    expect(look('sink', 0.5).sink).toBeGreaterThan(0)
    expect(look('sink', 0.5).sink).toBeLessThan(28)
  })

  it('none: the prototype\'s hard cut, whatever the edge says', () => {
    for (const edge of [0, 0.3, 1]) expect(look('none', edge)).toEqual({ opacity: 1, scale: 1, sink: 0 })
  })

  it('each is continuous and monotone in the edge (it scrubs), and ends at rest', () => {
    for (const mode of ['fade', 'fadeScale', 'sink'] as const) {
      const steps = Array.from({ length: 41 }, (_, k) => look(mode, k / 40))
      steps.forEach((step, k) => {
        if (k === 0) return
        expect(step.opacity).toBeGreaterThanOrEqual(steps[k - 1]!.opacity - 1e-12)
        expect(step.scale).toBeGreaterThanOrEqual(steps[k - 1]!.scale - 1e-12)
        expect(step.sink).toBeLessThanOrEqual(steps[k - 1]!.sink + 1e-12)
        // No jumps between neighbouring steps (a swipe passes through every one).
        expect(Math.abs(step.opacity - steps[k - 1]!.opacity)).toBeLessThan(0.12)
      })
      expect(steps.at(-1)).toEqual({ opacity: 1, scale: 1, sink: 0 })
    }
    expect(REEL_EDGES).toEqual(['fade', 'fadeScale', 'sink', 'none'])
  })

  it('an edge out of range is clamped', () => {
    expect(look('fade', 2).opacity).toBe(1)
    expect(look('fade', -1).opacity).toBe(0)
  })
})
