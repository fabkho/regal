import { describe, expect, it } from 'vitest'
import { ratingText } from '../../app/utils/books/rating'

describe('ratingText (the number beside the stars)', () => {
  it('writes two decimals only when needed', () => {
    expect(ratingText(4.25)).toBe('4.25')
    expect(ratingText(4.5)).toBe('4.5')
    expect(ratingText(4)).toBe('4')
    expect(ratingText(3.75)).toBe('3.75')
    expect(ratingText(5)).toBe('5')
  })

  it('rounds anything finer to two decimals', () => {
    expect(ratingText(4.333333)).toBe('4.33')
    expect(ratingText(3.999)).toBe('4')
  })
})
