import { describe, expect, it } from 'vitest'
import { createTickState, hapticsTuning, mayPulse, PATTERN_STEPS, pickPulse, PULSE_LIMITS, PULSES, scrollTick, TICK_GAP_MS, vibrates } from '../../app/utils/books/haptics'
import type { PulseGate } from '../../app/utils/books/haptics'

const gate = (over: Partial<PulseGate> = {}): PulseGate => ({ enabled: true, canVibrate: true, reducedMotion: false, userActive: true, ...over })

describe('pickPulse', () => {
  it('pulses when a Book is taken out, another swapped in, or one put back', () => {
    expect(pickPulse(null, 'a')).toBe('out')
    expect(pickPulse('a', 'b')).toBe('out')
    expect(pickPulse('a', null)).toBe('back')
  })

  it('stays quiet when nothing changed', () => {
    expect(pickPulse(null, null)).toBeNull()
    expect(pickPulse('a', 'a')).toBeNull()
  })
})

describe('mayPulse', () => {
  it('pulses only when the host allows it, the phone can, the user just acted and motion is welcome', () => {
    expect(mayPulse(gate())).toBe(true)
    expect(mayPulse(gate({ enabled: false }))).toBe(false)
    expect(mayPulse(gate({ canVibrate: false }))).toBe(false)
    expect(mayPulse(gate({ userActive: false }))).toBe(false)
    expect(mayPulse(gate({ reducedMotion: true }))).toBe(false)
  })
})

/** How long a pattern vibrates in all (its even steps). */
const buzz = (steps: readonly number[]) => steps.reduce((sum, step, index) => sum + (index % 2 === 0 ? step : 0), 0)

describe('PULSES', () => {
  it('makes a scroll tick the faintest pulse there is: a single pulse of a few ms', () => {
    expect(PULSES.tick).toHaveLength(1)
    expect(PULSES.tick[0]).toBeGreaterThanOrEqual(1)
    expect(PULSES.tick[0]).toBeLessThan(5)
  })

  it('makes taking a Book out an event, more than putting it back, still no buzz', () => {
    expect(PULSES.out.length).toBeGreaterThan(1)
    expect(buzz(PULSES.out)).toBeGreaterThan(buzz(PULSES.back))
    expect(buzz(PULSES.back)).toBeGreaterThan(buzz(PULSES.tick))
    expect(buzz(PULSES.out)).toBeLessThanOrEqual(30)
    expect(PULSES.out.reduce((sum, step) => sum + step, 0)).toBeLessThan(100)
  })
})

describe('vibrates', () => {
  it('is true when a vibrating step is longer than 0', () => {
    expect(vibrates([2])).toBe(true)
    expect(vibrates([0, 45, 18])).toBe(true)
    expect(vibrates([0])).toBe(false)
    expect(vibrates([0, 45])).toBe(false)
    expect(vibrates([])).toBe(false)
  })
})

describe('hapticsTuning (dev server only)', () => {
  it('follows the host and the constants without tuning parameters', () => {
    expect(hapticsTuning({})).toEqual({ enabled: null, patterns: PULSES })
    expect(hapticsTuning({ haptics: 'yes', hapticOut: '' })).toEqual({ enabled: null, patterns: PULSES })
  })

  it('turns them on or off with ?haptics=1|0', () => {
    expect(hapticsTuning({ haptics: '1' }).enabled).toBe(true)
    expect(hapticsTuning({ haptics: '0' }).enabled).toBe(false)
  })

  it('reads patterns in ms, rounded and clamped; 0 turns one off', () => {
    expect(hapticsTuning({ hapticOut: '12,40,20', hapticBack: '6.4', hapticTick: '0' }).patterns).toEqual({ out: [12, 40, 20], back: [6], tick: [0] })
    expect(hapticsTuning({ hapticOut: '500' }).patterns.out).toEqual([PULSE_LIMITS[1]])
    expect(hapticsTuning({ hapticBack: '-3' }).patterns.back).toEqual([PULSE_LIMITS[0]])
  })

  it('keeps the constant for anything that is not a short list of numbers', () => {
    expect(hapticsTuning({ hapticOut: 'long' }).patterns.out).toBe(PULSES.out)
    expect(hapticsTuning({ hapticOut: '10,,18' }).patterns.out).toBe(PULSES.out)
    expect(hapticsTuning({ hapticOut: Array.from({ length: PATTERN_STEPS + 1 }, () => '5').join(',') }).patterns.out).toBe(PULSES.out)
    expect(hapticsTuning({ hapticTick: ['3'] }).patterns.tick).toBe(PULSES.tick)
  })
})

describe('scrollTick', () => {
  /** Feeds focus changes at the given times (ms); returns the Books that ticked. */
  function feed(steps: [string | null, number][], touchScrolling = true) {
    const state = createTickState()
    return steps.filter(([focusId, now]) => scrollTick(state, focusId, touchScrolling, now)).map(([focusId]) => focusId)
  }

  it('ticks each new Book reaching the focus line while a finger scrolls', () => {
    expect(feed([['a', 0], ['b', 100], ['c', 200]])).toEqual(['a', 'b', 'c'])
  })

  it('never ticks when the pile moves without a finger (a re-sort, the wheel, keys, the pile loading)', () => {
    expect(feed([['a', 0], ['b', 100], ['c', 200]], false)).toEqual([])
  })

  it('stays quiet without a new Book: the same one again, or none (a Book out, hover leading)', () => {
    expect(feed([['a', 0], ['a', 100], [null, 200]])).toEqual(['a'])
  })

  it('ticks a fast flick sparsely: at most one tick per TICK_GAP_MS, skipped Books are not ticked later', () => {
    // A Book every 20 ms for half a second.
    const steps: [string, number][] = Array.from({ length: 25 }, (_, index) => [`b${index}`, index * 20])
    const ticked = feed(steps)
    expect(ticked.length).toBeLessThanOrEqual(Math.ceil(500 / TICK_GAP_MS))
    expect(ticked.length).toBeGreaterThan(3)
    expect(ticked[0]).toBe('b0')
  })

  it('a Book that came during the gap counts as seen: coming to rest on it later does not tick', () => {
    const state = createTickState()
    expect(scrollTick(state, 'a', true, 0)).toBe(true)
    expect(scrollTick(state, 'b', true, TICK_GAP_MS / 2)).toBe(false)
    expect(scrollTick(state, 'b', true, TICK_GAP_MS * 3)).toBe(false)
  })
})
