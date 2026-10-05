import { describe, expect, it } from 'vitest'
import { createTickState, hapticsTuning, mayPulse, pickPulse, PULSE_LIMITS, PULSE_MS, scrollTick, TICK_GAP_MS } from '../../app/utils/books/haptics'
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

describe('PULSE_MS', () => {
  it('keeps pulses short ticks (5–15 ms): putting back shorter than taking out, a scroll tick the faintest', () => {
    for (const ms of Object.values(PULSE_MS)) {
      expect(ms).toBeGreaterThanOrEqual(5)
      expect(ms).toBeLessThanOrEqual(15)
    }
    expect(PULSE_MS.back).toBeLessThan(PULSE_MS.out)
    expect(PULSE_MS.tick).toBeLessThan(PULSE_MS.back)
  })
})

describe('hapticsTuning (dev server only)', () => {
  it('follows the host and the constants without tuning parameters', () => {
    expect(hapticsTuning({})).toEqual({ enabled: null, durations: PULSE_MS })
    expect(hapticsTuning({ haptics: 'yes', hapticOut: '' })).toEqual({ enabled: null, durations: PULSE_MS })
  })

  it('turns them on or off with ?haptics=1|0', () => {
    expect(hapticsTuning({ haptics: '1' }).enabled).toBe(true)
    expect(hapticsTuning({ haptics: '0' }).enabled).toBe(false)
  })

  it('sets pulse lengths in ms, rounded and clamped', () => {
    expect(hapticsTuning({ hapticOut: '15', hapticBack: '10.4', hapticTick: '0' }).durations).toEqual({ out: 15, back: 10, tick: 0 })
    expect(hapticsTuning({ hapticOut: '500' }).durations.out).toBe(PULSE_LIMITS[1])
    expect(hapticsTuning({ hapticBack: '-3' }).durations.back).toBe(PULSE_LIMITS[0])
    expect(hapticsTuning({ hapticOut: 'long' }).durations.out).toBe(PULSE_MS.out)
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
