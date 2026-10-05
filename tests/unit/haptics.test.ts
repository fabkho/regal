import { describe, expect, it } from 'vitest'
import { hapticsTuning, mayPulse, pickPulse, PULSE_LIMITS, PULSE_MS } from '../../app/utils/books/haptics'
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
  it('keeps pulses short ticks (5–15 ms), putting back shorter than taking out', () => {
    for (const ms of Object.values(PULSE_MS)) {
      expect(ms).toBeGreaterThanOrEqual(5)
      expect(ms).toBeLessThanOrEqual(15)
    }
    expect(PULSE_MS.back).toBeLessThan(PULSE_MS.out)
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
    expect(hapticsTuning({ hapticOut: '15', hapticBack: '10.4' }).durations).toEqual({ out: 15, back: 10 })
    expect(hapticsTuning({ hapticOut: '500' }).durations.out).toBe(PULSE_LIMITS[1])
    expect(hapticsTuning({ hapticBack: '-3' }).durations.back).toBe(PULSE_LIMITS[0])
    expect(hapticsTuning({ hapticOut: 'long' }).durations.out).toBe(PULSE_MS.out)
  })
})
