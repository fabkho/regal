import { describe, expect, it } from 'vitest'
import { grabOffset, SCROLLBAR_MIN_THUMB, scrubProgress, thumbWidth } from '../../app/utils/row/scrollbar'

describe('row scroll bar', () => {
  it('sizes the thumb to the share the card shows, never thinner than the minimum', () => {
    expect(thumbWidth(0.25, 320)).toBe(80)
    expect(thumbWidth(0.02, 320)).toBe(SCROLLBAR_MIN_THUMB)
    expect(thumbWidth(1, 320)).toBe(320)
  })

  it('keeps the grabbed spot on the thumb, and centres the thumb on a press beside it', () => {
    // Thumb 80 wide at progress 0.5 of a 320 track: left = 0.5 * 240 = 120.
    expect(grabOffset(150, 0.5, 0.25, 320)).toBe(30)
    expect(grabOffset(20, 0.5, 0.25, 320)).toBe(40)
  })

  it('maps the thumb\'s place to the scroll progress, clamped to 0..1', () => {
    expect(scrubProgress(160, 40, 0.25, 320)).toBe(0.5)
    expect(scrubProgress(-30, 40, 0.25, 320)).toBe(0)
    expect(scrubProgress(400, 40, 0.25, 320)).toBe(1)
  })

  it('has nothing to scrub when the thumb fills the track', () => {
    expect(scrubProgress(100, 160, 1, 320)).toBe(0)
  })
})
