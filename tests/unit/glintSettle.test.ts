import { describe, expect, it } from 'vitest'
import {
  createGlintSettle,
  GLINT_DELAY,
  GLINT_DELAY_LIMITS,
  glintDelay,
  SETTLE_GAP,
  SETTLE_SPEED,
  settledGlint,
  scrolling,
} from '../../app/utils/stack/glintSettle'
import type { GlintSettle, ScrollFrame } from '../../app/utils/stack/glintSettle'

const DT = 1 / 60
const rest = (focusedId: string | null = 'a'): ScrollFrame => ({ focusedId, speed: 0, gap: 0, blocked: false })
const moving = (focusedId: string | null = 'a', speed = 0.4): ScrollFrame => ({ focusedId, speed, gap: 0, blocked: false })

/** Runs `frames` frames of `frame`; returns every glint fired, with the frame it fired in. */
function run(state: GlintSettle, frame: ScrollFrame, frames: number, delay = GLINT_DELAY) {
  const fired: { bookId: string, frame: number }[] = []
  for (let index = 0; index < frames; index++) {
    const bookId = settledGlint(state, frame, DT, delay)
    if (bookId) fired.push({ bookId, frame: index })
  }
  return fired
}

describe('scrolling', () => {
  it('is moving above the settle speed or short of the target, at rest below both', () => {
    expect(scrolling({ speed: 0, gap: 0 })).toBe(false)
    expect(scrolling({ speed: SETTLE_SPEED * 0.9, gap: SETTLE_GAP * 0.9 })).toBe(false)
    expect(scrolling({ speed: -SETTLE_SPEED * 1.5, gap: 0 })).toBe(true)
    expect(scrolling({ speed: 0, gap: SETTLE_GAP * 2 })).toBe(true)
  })
})

describe('settledGlint', () => {
  it('never glints while the pile moves, whichever Books pass the line', () => {
    const state = createGlintSettle()
    const passing = ['a', 'b', 'c', 'd', 'e', 'f']
    for (let index = 0; index < 120; index++) {
      expect(settledGlint(state, moving(passing[index % passing.length]), DT)).toBeNull()
    }
  })

  it('glints the Book it came to rest on once, a beat after the scroll stopped', () => {
    const state = createGlintSettle()
    run(state, moving('a'), 30)
    const fired = run(state, rest('c'), 120)
    expect(fired).toHaveLength(1)
    expect(fired[0]!.bookId).toBe('c')
    expect(fired[0]!.frame * DT).toBeCloseTo(GLINT_DELAY, 1)
  })

  it('counts a glide as scrolling: the beat starts only once it has run out', () => {
    const state = createGlintSettle()
    // A glide slowing down: still above the settle speed for a while.
    let speed = 0.55
    let frames = 0
    while (speed > SETTLE_SPEED) {
      expect(settledGlint(state, moving('b', speed), DT)).toBeNull()
      speed *= Math.exp(-DT / 0.25)
      frames++
    }
    expect(frames).toBeGreaterThan(30)
    expect(run(state, rest('b'), Math.round(GLINT_DELAY / DT) + 2)).toHaveLength(1)
  })

  it('waits for the view to arrive (a wheel step easing in), not just for the speed to drop', () => {
    const state = createGlintSettle()
    run(state, moving('a'), 10)
    expect(run(state, { focusedId: 'a', speed: 0, gap: SETTLE_GAP * 3, blocked: false }, 60)).toHaveLength(0)
    expect(run(state, rest('a'), 60)).toHaveLength(1)
  })

  it('drops the glint when the scroll starts again before the beat is up, and keeps nothing for later', () => {
    const state = createGlintSettle()
    run(state, moving('a'), 10)
    const almost = Math.floor(GLINT_DELAY / DT) - 3
    expect(run(state, rest('a'), almost)).toHaveLength(0)
    run(state, moving('b'), 5)
    // A new rest times afresh, on the new Book.
    const fired = run(state, rest('b'), 60)
    expect(fired).toEqual([{ bookId: 'b', frame: Math.ceil(GLINT_DELAY / DT - 1e-9) - 1 }])
  })

  it('glints once per rest: a long rest does not repeat it', () => {
    const state = createGlintSettle()
    run(state, moving(), 10)
    expect(run(state, rest('a'), 600)).toHaveLength(1)
  })

  it('does not glint a focus that changes under a resting pile (put back, swapped, loaded)', () => {
    const state = createGlintSettle()
    // At rest from the start (the pile loading): no scroll, no glint.
    expect(run(state, rest('a'), 120)).toHaveLength(0)
    // A Book out: blocked; put back, the focus returns on another Book.
    run(state, { ...rest(null), blocked: true }, 60)
    expect(run(state, rest('b'), 120)).toHaveLength(0)
  })

  it('a Book taken out during the beat cancels it; put back, nothing fires', () => {
    const state = createGlintSettle()
    run(state, moving('a'), 10)
    run(state, rest('a'), 5)
    run(state, { ...rest('a'), blocked: true }, 30)
    expect(run(state, rest('a'), 120)).toHaveLength(0)
  })

  it('spends the glint when the pile rests on no Book (hover leads), rather than keeping it', () => {
    const state = createGlintSettle()
    run(state, moving('a'), 10)
    run(state, rest(null), 30)
    expect(run(state, rest('a'), 120)).toHaveLength(0)
  })

  it('follows the delay it is given', () => {
    const state = createGlintSettle()
    run(state, moving(), 10)
    const fired = run(state, rest('a'), 120, 1)
    expect(fired[0]!.frame * DT).toBeCloseTo(1, 1)
    const now = createGlintSettle()
    run(now, moving(), 10)
    expect(run(now, rest('a'), 1, 0)).toHaveLength(1)
  })
})

describe('glintDelay (dev server only)', () => {
  it('is GLINT_DELAY without ?glintDelay', () => {
    expect(glintDelay({})).toBe(GLINT_DELAY)
    expect(glintDelay({ glintDelay: '' })).toBe(GLINT_DELAY)
    expect(glintDelay({ glintDelay: 'long' })).toBe(GLINT_DELAY)
    expect(glintDelay({ glintDelay: ['1'] })).toBe(GLINT_DELAY)
  })

  it('reads seconds, clamped', () => {
    expect(glintDelay({ glintDelay: '0.6' })).toBe(0.6)
    expect(glintDelay({ glintDelay: '9' })).toBe(GLINT_DELAY_LIMITS[1])
    expect(glintDelay({ glintDelay: '-1' })).toBe(GLINT_DELAY_LIMITS[0])
  })
})
