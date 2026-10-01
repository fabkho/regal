import { describe, expect, it } from 'vitest'
import { cleanPublisher, mapGenre, parseQuotes, plainText, resolveQuotes, tidyQuote, verifiedQuotes } from '../../scripts/assets/backText'
import { photoFacesIn, photoFileFor } from '../../scripts/assets/photos'

const DESCRIPTION = `<p>"A brilliant, moving novel about memory." <em>—The New York Times</em></p>
<p>"Nobody writes a sentence like Fairweather." —Ursula Vance, author of <i>Low Tide</i></p>
<p>Mycroft Canner is a convict. For his crimes he is required to wander the world being as useful as he can to all he meets.</p>`

describe('plainText', () => {
  it('keeps the praise quotes that the blurb cleaner strips', () => {
    const text = plainText(DESCRIPTION)
    expect(text).toContain('A brilliant, moving novel about memory.')
    expect(text).toContain('—The New York Times')
    expect(text).not.toContain('<p>')
    expect(text).not.toContain('<em>')
  })

  it('decodes entities and collapses runs of space', () => {
    expect(plainText('a&nbsp;&amp;&#39;b   c')).toBe('a &\'b c')
  })
})

describe('verifiedQuotes', () => {
  const source = plainText(DESCRIPTION)

  it('keeps quotes the model copied verbatim, with their attribution', () => {
    const quotes = verifiedQuotes([
      { text: '"A brilliant, moving novel about memory."', source: '—The New York Times' },
      { text: 'Nobody writes a sentence like Fairweather.', source: 'Ursula Vance' },
    ], source)
    expect(quotes).toEqual([
      { text: 'A brilliant, moving novel about memory.', source: 'The New York Times' },
      { text: 'Nobody writes a sentence like Fairweather.', source: 'Ursula Vance' },
    ])
  })

  it('drops anything the model wrote itself', () => {
    expect(verifiedQuotes([{ text: 'An instant classic of our time.', source: 'The Guardian' }], source)).toEqual([])
  })

  it('ignores punctuation and case when checking, as onlyDeleted does', () => {
    const quotes = verifiedQuotes([{ text: 'A BRILLIANT moving novel about memory!', source: 'NYT' }], source)
    expect(quotes).toHaveLength(1)
  })

  it('drops fragments lifted out of the middle of a sentence', () => {
    expect(verifiedQuotes([{ text: 'moving novel about memory', source: 'The Times' }], source)).toEqual([])
    expect(verifiedQuotes([{ text: 'A brilliant, moving novel about', source: 'The Times' }], source)).toEqual([])
    expect(verifiedQuotes([{ text: 'memory.', source: 'The Times' }], source)).toEqual([])
  })

  it('drops quotes that are too long to print, unattributed or duplicated', () => {
    const long = 'x'.repeat(200)
    expect(verifiedQuotes([{ text: long, source: 'Someone' }], `${long} and more`)).toEqual([])
    expect(verifiedQuotes([{ text: 'Mycroft Canner is a convict.', source: '' }], source)).toEqual([])
    expect(verifiedQuotes([
      { text: 'Mycroft Canner is a convict.', source: 'A' },
      { text: '"Mycroft Canner is a convict."', source: 'B' },
    ], source)).toHaveLength(1)
  })

  it('never prints more than two', () => {
    const many = Array.from({ length: 4 }, () => ({ text: 'Mycroft Canner is a convict.', source: 'A' }))
    expect(verifiedQuotes(many, source).length).toBeLessThanOrEqual(2)
  })

  it('survives a model answer with the wrong shape', () => {
    expect(verifiedQuotes([{ text: 42, source: null } as never], source)).toEqual([])
  })
})

describe('tidyQuote', () => {
  it('strips the quotation marks, dashes and leading ellipsis', () => {
    expect(tidyQuote({ text: '  “…A fine book.” ', source: ' —The Times ' })).toEqual({ text: 'A fine book.', source: 'The Times' })
  })
})

describe('parseQuotes', () => {
  it('finds the JSON array in a fenced or chatty answer', () => {
    expect(parseQuotes('```json\n[{"text":"a","source":"b"}]\n```')).toEqual([{ text: 'a', source: 'b' }])
    expect(parseQuotes('Here you go: [{"text":"a","source":"b"}] — hope that helps')).toEqual([{ text: 'a', source: 'b' }])
  })

  it('returns nothing for prose or broken JSON', () => {
    expect(parseQuotes('There are no praise quotes here.')).toEqual([])
    expect(parseQuotes('[{"text": ]')).toEqual([])
  })
})

describe('resolveQuotes', () => {
  it('asks the model once and keeps only the verified quotes', async () => {
    const prompts: string[] = []
    const ask = async (prompt: string) => {
      prompts.push(prompt)
      return JSON.stringify([
        { text: 'A brilliant, moving novel about memory.', source: 'The New York Times' },
        { text: 'The best book of the decade.', source: 'Invented Weekly' },
      ])
    }
    const quotes = await resolveQuotes(DESCRIPTION, ask)
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain('Mycroft Canner is a convict.')
    expect(quotes).toEqual([{ text: 'A brilliant, moving novel about memory.', source: 'The New York Times' }])
  })

  it('does not call the model for a short or missing description', async () => {
    let calls = 0
    const ask = async () => {
      calls++
      return '[]'
    }
    expect(await resolveQuotes(null, ask)).toEqual([])
    expect(await resolveQuotes('Too short.', ask)).toEqual([])
    expect(calls).toBe(0)
  })

  it('treats a failing model as "no quotes"', async () => {
    const ask = async () => {
      throw new Error('503')
    }
    expect(await resolveQuotes(DESCRIPTION, ask)).toEqual([])
  })
})

describe('mapGenre', () => {
  it('maps Apple genre lists to one printable shelf category', () => {
    expect(mapGenre(['Sci-Fi & Fantasy', 'Books', 'Fiction & Literature'])).toBe('SCIENCE FICTION')
    expect(mapGenre(['Books', 'Fiction & Literature', 'Literary'])).toBe('FICTION / LITERARY')
    expect(mapGenre(['Mysteries & Thrillers'])).toBe('FICTION / THRILLER')
    expect(mapGenre(['Biographies & Memoirs'])).toBe('BIOGRAPHY / MEMOIR')
    expect(mapGenre(['Computers & Internet'])).toBe('TECHNOLOGY')
  })

  it('prefers the shelf a cover prints over Apple\'s sub-shelves', () => {
    expect(mapGenre(['Adventure Sci-Fi', 'Books', 'Sci-Fi & Fantasy', 'Science Fiction', 'Mysteries & Thrillers'])).toBe('SCIENCE FICTION')
    expect(mapGenre(['Travel & Adventure', 'Books'])).toBe('TRAVEL')
  })

  it('skips the shelves Apple puts on everything', () => {
    expect(mapGenre(['Books', 'eBooks'])).toBeNull()
    expect(mapGenre(['Books', 'Fiction'])).toBe('FICTION')
    expect(mapGenre(['Books', 'Nonfiction'])).toBe('NONFICTION')
  })

  it('has no label without usable genres', () => {
    expect(mapGenre([])).toBeNull()
    expect(mapGenre(null)).toBeNull()
    expect(mapGenre([null, undefined, '  '])).toBeNull()
  })
})

describe('cleanPublisher', () => {
  it('trims the imprint and drops trailing punctuation', () => {
    expect(cleanPublisher('  Tor  Books.  ')).toBe('Tor Books')
    expect(cleanPublisher('Penguin Classics')).toBe('Penguin Classics')
  })

  it('un-inverts the catalogue form and drops the legal tail', () => {
    expect(cleanPublisher('Doherty Associates, LLC, Tom')).toBe('Tom Doherty Associates')
    expect(cleanPublisher('Ace Books, Inc.')).toBe('Ace Books')
    expect(cleanPublisher('Knopf Doubleday Publishing Group')).toBe('Knopf Doubleday Publishing Group')
  })

  it('refuses nothing and sentence-length rubbish', () => {
    expect(cleanPublisher('')).toBeNull()
    expect(cleanPublisher(null)).toBeNull()
    expect(cleanPublisher('Published by a very long chain of imprints and partners worldwide')).toBeNull()
  })
})

describe('photo drop-ins', () => {
  it('spots the faces a drop-in folder holds, in face order', () => {
    expect(photoFacesIn(['back.jpg', 'front.JPG', 'spine.png'])).toEqual(['front', 'spine', 'back'])
    expect(photoFacesIn(['front.jpeg'])).toEqual(['front'])
    expect(photoFacesIn([])).toEqual([])
  })

  it('ignores anything that is not a face file', () => {
    expect(photoFacesIn(['frontcover.jpg', 'front.txt', 'notes.md', '.DS_Store'])).toEqual([])
  })

  it('prefers webp over the camera formats', () => {
    expect(photoFileFor(['front.jpg', 'front.webp'], 'front')).toBe('front.webp')
    expect(photoFileFor(['front.JPG'], 'front')).toBe('front.JPG')
    expect(photoFileFor(['spine.png'], 'back')).toBeNull()
  })
})
