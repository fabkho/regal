import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateLibraryFile } from '../../shared/library/libraryFile'
import { assetFaces } from '../../app/utils/covers/bookAssets'
import { drawBack, drawSpine } from '../../app/utils/covers/bookFaces'
import type { FaceInput } from '../../app/utils/covers/bookFaces'
import { FLAT_AHEAD, flatSpineWanted } from '../../app/utils/covers/loadWindow'
import type { LoadView } from '../../app/utils/covers/loadWindow'
import { INK, PAPER, readableOn } from '../../app/utils/covers/palette'
import type { RGB } from '../../app/utils/covers/palette'
import { assetEntryOf, isMemorySource, memorySource, readLibraryDocument, resolveLibraryUrl } from '../../app/utils/library/libraryFile'

// Flat faces: a Book with one colour (`assets.color`) has its Spine and back drawn
// flat in it, its typeset Spine following the view, and an in-memory library.

const book = (assets: Record<string, unknown> | null = null, id = 'b-1') => ({
  id,
  title: 'The Left Hand of Darkness',
  authors: ['Ursula K. Le Guin'],
  status: 'read',
  pages: 304,
  ...(assets ? { assets } : {}),
})
const file = (books: unknown[]) => ({ version: 2, generatedAt: '2026-10-11T08:00:00Z', owner: 'Ada', books })

describe('assets.color in the library file', () => {
  it('is a #rrggbb colour, or absent', () => {
    expect(validateLibraryFile(file([book({ color: '#3a5f8c', front: 'https://example.com/f.jpg' })])).ok).toBe(true)
    expect(validateLibraryFile(file([book({ color: null })])).ok).toBe(true)
    const result = validateLibraryFile(file([book({ color: 'blue' })]))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]!.path).toBe('books[0].assets.color')
  })

  it('travels to the display with the Book\'s faces', () => {
    expect(assetEntryOf(book({ color: '#3a5f8c' }) as never)).toEqual({ color: '#3a5f8c' })
  })
})

describe('assetFaces of a flat Book', () => {
  const at = (reference: string) => resolveLibraryUrl(reference, 'https://books.example.com/v2/library.json', 'https://example.com/')

  it('is flat in its colour, with the ink that reads on it as the Spine\'s palette', () => {
    const faces = assetFaces({ color: '#1d3b5a', front: 'https://example.com/f.jpg' }, at)
    expect(faces.flat).toEqual([0x1D, 0x3B, 0x5A])
    expect(faces.palette).toEqual({ background: [0x1D, 0x3B, 0x5A], text: PAPER, accent: PAPER })
    // Its boards (page edges) take it too.
    expect(faces.spineColor).toEqual([0x1D, 0x3B, 0x5A])
  })

  it('takes ink on a light colour, paper on a dark one (WCAG contrast)', () => {
    expect(assetFaces({ color: '#e8dcc0' }, at).palette!.text).toEqual(INK)
    expect(assetFaces({ color: '#202020' }, at).palette!.text).toEqual(PAPER)
  })

  it('keeps Spine art over the colour: art wins', () => {
    expect(assetFaces({ color: '#1d3b5a', spine: 'k/spine.webp' }, at).flat).toBeNull()
    expect(assetFaces({ color: '#1d3b5a', pile: { spine: 'k/spine-pile.webp' } }, at).flat).toBeNull()
  })

  it('is not flat without a colour (the published file draws as before)', () => {
    const faces = assetFaces({ palette: { background: '#48445c', text: '#F5F2EB', accent: '#1c1926' } }, at)
    expect(faces.flat).toBeNull()
    expect(faces.palette!.background).toEqual([0x48, 0x44, 0x5C])
  })
})

describe('flatSpineWanted', () => {
  const view: LoadView = { focusY: 0, targetY: 0, halfView: 0.5, speed: 0 }
  const margin = FLAT_AHEAD * 2 * view.halfView

  it('draws the typeset Spine in and near the view', () => {
    expect(flatSpineWanted(0, view)).toBe('draw')
    expect(flatSpineWanted(view.halfView + margin - 0.01, view)).toBe('draw')
  })

  it('keeps it a while beyond, then drops it far away', () => {
    expect(flatSpineWanted(view.halfView + margin * 1.5, view)).toBe('keep')
    expect(flatSpineWanted(-(view.halfView + margin * 2.5), view)).toBe('drop')
  })

  it('reaches further in the direction of a fling', () => {
    const fling: LoadView = { ...view, speed: 4 }
    expect(flatSpineWanted(view.halfView + margin * 2.5, view)).toBe('drop')
    expect(flatSpineWanted(view.halfView + margin * 2.5, fling)).toBe('draw')
  })

  it('always draws a Book reached for, and every Spine without a view', () => {
    expect(flatSpineWanted(100, view, 'picked')).toBe('draw')
    expect(flatSpineWanted(100, view, 'hovered')).toBe('draw')
    expect(flatSpineWanted(100, null)).toBe('draw')
  })
})

describe('an in-memory library', () => {
  it('is read like a file, nothing fetched', () => {
    const result = readLibraryDocument(file([book({ color: '#1d3b5a', front: 'https://example.com/f.jpg' })]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.library.books[0]!.title).toBe('The Left Hand of Darkness')
    expect(result.library.assets['b-1']).toEqual({ color: '#1d3b5a', front: 'https://example.com/f.jpg' })
    expect(result.library.owner).toBe('Ada')
  })

  it('says why a document cannot be shown, as for a file', () => {
    const result = readLibraryDocument({ version: 2, books: 'none' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe('This is not a valid Regal library file.')
  })

  it('has one source key per document object', () => {
    const a = file([])
    const b = file([])
    expect(memorySource(a)).toBe(memorySource(a))
    expect(memorySource(a)).not.toBe(memorySource(b))
    expect(isMemorySource(memorySource(a))).toBe(true)
    expect(isMemorySource('https://books.example.com/v2/library.json')).toBe(false)
  })

  it('loads absolute images only: there is no file to be relative to', () => {
    const src = memorySource(file([]))
    expect(resolveLibraryUrl('https://is1-ssl.mzstatic.com/a/600x600bb.jpg', src, 'https://libellus.example/profile')).toBe('https://is1-ssl.mzstatic.com/a/600x600bb.jpg')
    expect(resolveLibraryUrl('covers/a.jpg', src, 'https://libellus.example/profile')).toBeNull()
  })
})

// A canvas that records what is drawn on it (node has none).
type Call = { op: string, args: unknown[], fillStyle: string }
let calls: Call[] = []

function fakeCanvas() {
  const context: Record<string, unknown> = {
    fillStyle: '',
    font: '10px serif',
    textAlign: 'left',
    textBaseline: 'top',
    shadowColor: '',
    shadowBlur: 0,
    filter: 'none',
    globalAlpha: 1,
    measureText: (text: string) => ({ width: text.length * Number.parseFloat(/(\d+(\.\d+)?)px/.exec(String(context.font))?.[1] ?? '10') * 0.5 }),
    createLinearGradient: (...args: unknown[]) => {
      calls.push({ op: 'createLinearGradient', args, fillStyle: String(context.fillStyle) })
      return { addColorStop: () => {} }
    },
  }
  for (const op of ['fillRect', 'fillText', 'drawImage', 'save', 'restore', 'translate', 'rotate']) {
    context[op] = (...args: unknown[]) => calls.push({ op, args, fillStyle: String(context.fillStyle) })
  }
  return { width: 0, height: 0, getContext: () => context }
}

const input = (background: RGB, extra: Partial<FaceInput> = {}): FaceInput => ({
  book: { id: 'b-1', title: 'The Left Hand of Darkness', seriesTitle: null, author: 'Ursula K. Le Guin', isbn13: '9780441478125' },
  thickness: 0.03,
  height: 0.2,
  depth: 0.13,
  palette: { background, text: readableOn(background), accent: readableOn(background) },
  seed: 1,
  description: 'A blurb printed on the back. It runs on.',
  flat: true,
  ...extra,
})

describe('flat faces, drawn', () => {
  beforeEach(() => {
    calls = []
    ;(globalThis as { document?: unknown }).document = { createElement: () => fakeCanvas() }
  })
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document
  })

  const navy: RGB = [0x1D, 0x3B, 0x5A]
  const sand: RGB = [0xE8, 0xDC, 0xC0]

  it('draws a Spine in one colour, no sheen, the title and author in its ink', () => {
    drawSpine(input(navy))
    expect(calls.find(call => call.op === 'createLinearGradient')).toBeUndefined()
    expect(calls.find(call => call.op === 'fillRect')!.fillStyle).toBe('rgba(29, 59, 90, 1)')
    const texts = calls.filter(call => call.op === 'fillText')
    expect(texts.map(call => call.args[0])).toEqual(['The Left Hand of Darkness', 'Ursula K. Le Guin'])
    expect(texts[0]!.fillStyle).toBe('rgba(245, 242, 235, 1)')
  })

  it('takes ink on a light colour', () => {
    drawSpine(input(sand))
    expect(calls.filter(call => call.op === 'fillText')[0]!.fillStyle).toBe('rgba(44, 44, 42, 1)')
  })

  it('prints the back on its one colour: title, author, blurb and the ISBN barcode in its ink', () => {
    const cover = { width: 10, height: 10 } as unknown as FaceInput['cover']
    drawBack(input(navy, { cover, publisher: 'Ace' }))
    const fills = calls.filter(call => call.op === 'fillRect')
    expect(fills[0]!.fillStyle).toBe('rgba(29, 59, 90, 1)')
    // No Cover blurred through it.
    expect(calls.find(call => call.op === 'drawImage')).toBeUndefined()
    const texts = calls.filter(call => call.op === 'fillText')
    const printed = texts.map(call => call.args[0]).join(' ')
    expect(printed).toContain('Darkness')
    expect(printed).toContain('Le Guin')
    expect(printed).toContain('blurb')
    expect(printed).toContain('9 780441 478125')
    // The type in the colour's ink (paper on navy); the barcode on its white panel.
    expect(texts.find(call => call.args[0] === 'The Left Hand of Darkness')!.fillStyle).toBe('rgba(245, 242, 235, 0.95)')
    expect(fills.some(call => call.fillStyle === '#fbfaf6')).toBe(true)
  })

  it('prints no barcode without an ISBN', () => {
    drawBack(input(navy, { book: { id: 'b-2', title: 'Untitled', seriesTitle: null, author: null, isbn13: null } }))
    expect(calls.some(call => call.op === 'fillRect' && call.fillStyle === '#fbfaf6')).toBe(false)
  })

  it('leaves a Book that is not flat as before: a sheen on the Spine', () => {
    drawSpine(input(navy, { flat: false }))
    expect(calls.find(call => call.op === 'createLinearGradient')).toBeDefined()
  })
})
