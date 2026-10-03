import { describe, expect, it } from 'vitest'
import { isPlaceholder, storefronts, titleScore } from '../src/assets/front'
import { toIsbn13 } from '../src/isbn'

describe('ISBN helpers', () => {
  it('converts ISBN-10 to ISBN-13', () => {
    expect(toIsbn13('0306406152')).toBe('9780306406157')
    expect(toIsbn13('9780306406157')).toBe('9780306406157')
    expect(toIsbn13('YlsoGKoxeN')).toBeNull()
  })
})

describe('front lookup helpers', () => {
  it('rejects Google placeholders and thumbnails', () => {
    expect(isPlaceholder(128, 184)).toBe(true)
    expect(isPlaceholder(130, 200)).toBe(true)
    expect(isPlaceholder(384, 599)).toBe(false)
  })

  it('looks German reads up in the German store', () => {
    expect(storefronts('de')).toEqual(['de'])
    expect(storefronts('en')).toEqual(['us', 'gb'])
  })

  it('matches store titles with subtitles or series on either side, not omnibus to volume', () => {
    expect(titleScore('The Light of All (The Trilogy, #3)', 'The Light of All')).toBe(2)
    expect(titleScore('Queen of Ash: A Tale', 'Queen of Ash')).toBe(2)
    expect(titleScore('Shadow & Claw: The First Half', 'Shadow & Claw')).toBe(2)
    expect(titleScore('Ember', 'The Ember Trilogy')).toBe(0)
    expect(titleScore('Dune Messiah', 'Dune')).toBe(0)
    expect(titleScore('Sandglass Volume One Deluxe', 'Sandglass Volume One')).toBe(1)
  })
})
