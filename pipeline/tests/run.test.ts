// The whole run offline: a synthetic library file and images in a temp
// folder, the lookups and Gemini stubbed, the uploader recording.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AiTools } from '../src/ai'
import type { JacketResult } from '../src/assets/jacket'
import type { Tools } from '../src/enrich'
import { assetKey } from '../src/enrich'
import type { RegalLibraryFile } from '../src/layer'
import { validateLibraryFile } from '../src/layer'
import type { Uploader } from '../src/publish'
import type { RunOptions } from '../src/run'
import { InvalidInputError, runAssets } from '../src/run'

const png = (width: number, height: number, background: string) =>
  sharp({ create: { width, height, channels: 3, background } }).png().toBuffer()

let dir: string
let calls: Record<string, number>
let uploads: string[]

const input = (books: unknown[]): RegalLibraryFile => ({ version: 2, generatedAt: '2026-05-01T06:00:00Z', owner: 'Test', generator: 'test fixture', books } as RegalLibraryFile)

const BOOKS = [
  // Everything there and good enough: kept as it is.
  { id: 'a', title: 'Alpha', authors: ['Ann'], isbn13: '9780000000001', pages: 300, status: 'read', dateRead: '2026-04-01', rating: 4, description: 'About Alpha.', assets: { front: 'img/a-front.png', spine: 'img/a-spine.png', back: 'img/a-back.png', source: 'ai' } },
  // A small front: the front chain finds a bigger one.
  { id: 'b', title: 'Beta', authors: ['Ben'], isbn13: '9780000000002', status: 'read', dateRead: '2026-03-01', description: 'About Beta.', assets: { front: 'img/b-front.png' } },
  // Nothing at all and no blurb: no front anywhere, the blurb is looked up.
  { id: 'c', title: 'Gamma', authors: [], status: 'to-read' },
  // Photographed by the owner (drop-ins).
  { id: 'd/odd id', title: 'Delta', authors: ['Dee'], status: 'read', dateRead: '2025-01-01', description: 'About Delta.' },
]

function tools(): Tools {
  return {
    resolveFront: async (book) => {
      calls.resolveFront = (calls.resolveFront ?? 0) + 1
      if (book.title === 'Gamma') return null
      const image = await png(1000, 1500, '#335577')
      return { image, width: 1000, height: 1500, source: 'google', url: 'https://example.test/front.png', appleDescription: null, appleGenres: [] }
    },
    findApple: async () => {
      calls.findApple = (calls.findApple ?? 0) + 1
      return { via: 'search', description: 'A story told by the stub, long enough to be a blurb on a back cover.', genres: ['Sci-Fi & Fantasy'] }
    },
    resolveBlurb: async (apple) => {
      calls.resolveBlurb = (calls.resolveBlurb ?? 0) + 1
      return apple ? { text: apple, source: 'apple', method: 'rules' } : { text: '', source: 'none', method: 'rules' }
    },
    resolveDescription: async () => null,
    resolvePublisher: async () => 'Stub House',
    resolveQuotes: async () => [],
  }
}

const refuse = () => Promise.reject(new Error('Gemini must not be called'))
const noAi: AiTools = { jacketRequest: refuse, generateJacket: refuse, submitImageBatch: refuse, getImageBatch: refuse }

const uploader: Uploader = {
  put: async (key) => {
    uploads.push(`put ${key}`)
  },
  remove: async (key) => {
    uploads.push(`delete ${key}`)
  },
}

function options(overrides: Partial<RunOptions> = {}): RunOptions {
  return {
    input: join(dir, 'in/library.json'),
    out: join(dir, 'out'),
    cacheDir: join(dir, 'cache'),
    photos: join(dir, 'photos'),
    limit: Infinity,
    ai: false,
    model: false,
    now: false,
    wait: 0,
    force: false,
    revalidate: false,
    publish: null,
    bucket: 'test-bucket',
    dryRun: false,
    concurrency: 2,
    timestamp: '2026-05-02T06:00:00Z',
    ...overrides,
  }
}

const run = (overrides: Partial<RunOptions> = {}, aiTools: AiTools = noAi) =>
  runAssets(options(overrides), { tools: tools(), aiTools, uploader, log: () => {}, warn: () => {} })

const writeInput = (books: unknown[]) => writeFileSync(join(dir, 'in/library.json'), JSON.stringify(input(books)))
const book = (library: RegalLibraryFile, id: string) => library.books.find(item => item.id === id)!

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'regal-assets-'))
  calls = {}
  uploads = []
  mkdirSync(join(dir, 'in/img'), { recursive: true })
  writeFileSync(join(dir, 'in/img/a-front.png'), await png(600, 900, '#aa3322'))
  writeFileSync(join(dir, 'in/img/a-spine.png'), await png(60, 900, '#223344'))
  writeFileSync(join(dir, 'in/img/a-back.png'), await png(600, 900, '#445566'))
  writeFileSync(join(dir, 'in/img/b-front.png'), await png(300, 450, '#118811'))
  writeInput(BOOKS)
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function dropPhotos(key: string) {
  const folder = join(dir, 'photos', key)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'front.jpg'), await sharp({ create: { width: 500, height: 800, channels: 3, background: '#998877' } }).jpeg().toBuffer())
  writeFileSync(join(folder, 'spine.png'), await png(50, 800, '#776655'))
  writeFileSync(join(folder, 'back.webp'), await sharp({ create: { width: 500, height: 800, channels: 3, background: '#665544' } }).webp().toBuffer())
}

describe('regal-assets run', () => {
  it('rejects an invalid input file without writing anything', async () => {
    writeFileSync(join(dir, 'in/library.json'), JSON.stringify({ books: [] }))
    await expect(run()).rejects.toBeInstanceOf(InvalidInputError)
    expect(existsSync(join(dir, 'out'))).toBe(false)
  })

  it('enriches every Book and writes a valid library file with its images', async () => {
    await dropPhotos(assetKey({ id: 'd/odd id' }))
    const result = await run()
    expect(validateLibraryFile(result.library).ok).toBe(true)
    expect(result.library.generator).toBe('regal-assets (from test fixture)')
    expect(result.library.owner).toBe('Test')

    const alpha = book(result.library, 'a')
    expect(alpha.assets).toMatchObject({ front: '9780000000001/front.webp', spine: '9780000000001/spine.webp', back: '9780000000001/back.webp', source: 'ai', pile: { front: '9780000000001/front-pile.webp', spine: '9780000000001/spine-pile.webp' } })
    expect(alpha.assets?.palette?.background).toMatch(/^#[\da-f]{6}$/)
    expect(alpha.assets?.spineColor).toMatch(/^#[\da-f]{6}$/)
    expect(alpha.rating).toBe(4)

    const beta = book(result.library, 'b')
    expect(beta.assets?.front).toBe('9780000000002/front.webp')
    expect((await sharp(join(dir, 'out', beta.assets!.front!)).metadata()).height).toBe(1500)
    expect(beta.assets?.spine).toBeUndefined()

    const gamma = book(result.library, 'c')
    expect(gamma.assets?.front).toBeUndefined()
    expect(gamma.description).toMatch(/^A story told by the stub/)
    expect(gamma.genre).toBe('SCIENCE FICTION')
    expect(gamma.publisher).toBe('Stub House')

    const delta = book(result.library, 'd/odd id')
    expect(delta.assets?.photoFaces).toEqual(['front', 'spine', 'back'])
    expect(delta.assets?.source).toBe('photo')
    expect(delta.assets?.front).toMatch(/^id-[\da-f]{16}\/front\.webp$/)

    for (const item of result.library.books) {
      for (const ref of [item.assets?.front, item.assets?.spine, item.assets?.back, item.assets?.pile?.front, item.assets?.pile?.spine]) {
        if (ref) expect(existsSync(join(dir, 'out', ref)), ref).toBe(true)
      }
    }
    // Alpha's front was good enough: no lookup for it. Beta and Gamma looked.
    expect(calls.resolveFront).toBe(2)
    // Beta (front below 800 px) wants AI; Gamma has no front, Delta is photographed, Alpha complete.
    expect(result.wantingAi).toBe(1)
  })

  it('is idempotent: a second run rebuilds nothing and leaves the file byte for byte', async () => {
    await run()
    const before = readFileSync(join(dir, 'out/library.json'))
    calls = {}
    const again = await run({ timestamp: '2026-05-02T12:00:00Z' })
    expect(again.built).toBe(0)
    expect(again.cached).toBe(4)
    expect(again.written).toBe(false)
    expect(calls).toEqual({})
    expect(readFileSync(join(dir, 'out/library.json')).equals(before)).toBe(true)
  })

  it('looks again for what it didn\'t find, a day later', async () => {
    await run()
    calls = {}
    const later = await run({ timestamp: '2026-05-03T06:00:00Z' })
    // Gamma found no front: it is tried again; the others stay cached.
    expect(later.built).toBe(1)
    expect(calls.resolveFront).toBe(1)
    expect(later.written).toBe(false)
  })

  it('does not nest its own name when it reads its own output', async () => {
    const first = await run()
    writeFileSync(join(dir, 'in/library.json'), JSON.stringify({ ...first.library, assets: undefined }))
    const again = await run({ input: join(dir, 'out/library.json'), out: join(dir, 'out2') })
    expect(again.library.generator).toBe('regal-assets (from test fixture)')
  })

  it('is incremental: only the Book whose input changed is rebuilt; other fields pass straight through', async () => {
    await run()
    writeFileSync(join(dir, 'in/img/a-front.png'), await png(600, 900, '#000000'))
    writeInput(BOOKS.map(item => (item.id === 'b' ? { ...item, rating: 2.75 } : item)))
    const again = await run()
    expect(again.built).toBe(1)
    expect(again.cached).toBe(3)
    expect(book(again.library, 'b').rating).toBe(2.75)
  })

  it('publishes only changed files under the prefix, the library file last', async () => {
    const first = await run({ publish: 'v2' })
    expect(uploads.every(line => line.startsWith('put v2/'))).toBe(true)
    expect(uploads.at(-1)).toBe('put v2/library.json')
    expect(first.plan!.images.length).toBe(uploads.length - 1)

    uploads = []
    const unchanged = await run({ publish: 'v2' })
    expect(unchanged.plan).toEqual({ images: [], json: [], gone: [] })
    expect(uploads).toEqual([])

    writeFileSync(join(dir, 'in/img/a-back.png'), await png(600, 900, '#ffffff'))
    await run({ publish: 'v2' })
    // The library file names the same files: only the image goes up.
    expect(uploads).toEqual(['put v2/9780000000001/back.webp'])

    // A Book that leaves the Library: its files are deleted under the prefix, nothing else.
    uploads = []
    writeInput(BOOKS.filter(item => item.id !== 'a'))
    await run({ publish: 'v2' })
    expect(uploads.filter(line => line.startsWith('delete')).sort()).toEqual([
      'delete v2/9780000000001/back.webp',
      'delete v2/9780000000001/front-pile.webp',
      'delete v2/9780000000001/front.webp',
      'delete v2/9780000000001/spine-pile.webp',
      'delete v2/9780000000001/spine.webp',
    ])
  })

  it('writes nothing remote on a dry run and refuses the bucket root', async () => {
    const result = await run({ publish: 'v2', dryRun: true })
    expect(uploads).toEqual([])
    expect(result.plan!.json).toEqual(['library.json'])
    // Nothing was recorded as published: the real run uploads everything.
    await run({ publish: 'v2' })
    expect(uploads).toContain('put v2/library.json')
    await expect(run({ publish: '' })).rejects.toThrow(/prefix/)
    await expect(run({ publish: '/' })).rejects.toThrow(/prefix/)
    await expect(run({ publish: 'v2', limit: 2 })).rejects.toThrow(/--limit/)
  })

  it('publishes nothing when a Book failed', async () => {
    const offline = { ...tools(), resolveFront: () => Promise.reject(new Error('offline')) }
    const result = await runAssets(options({ publish: 'v2' }), { tools: offline, aiTools: noAi, uploader, log: () => {}, warn: () => {} })
    // Beta, Gamma and Delta need the front chain.
    expect(result.failed).toBe(3)
    expect(result.plan).toBeNull()
    expect(uploads).toEqual([])
  })

  it('costs AI on a dry run without calling Gemini', async () => {
    // Beta (small front, replaced) and Delta (front found, no photos here) have no Spine/back.
    const result = await run({ ai: true, dryRun: true })
    expect(result.aiImages).toBe(2)
    expect(book(result.library, 'b').assets?.spine).toBeUndefined()
  })

  it('makes AI Spine/back for the Books that want them, and never pays twice', async () => {
    let generated = 0
    const jacket = async (): Promise<JacketResult> => {
      generated++
      const layout = { ratio: '3:2', width: 2528, height: 1696, frontWidth: 1131, spineWidth: 100, spineX: 1297, frontX: 1397 }
      return { jacket: await sharp(await png(2528, 1696, '#123456')).webp().toBuffer(), spine: await png(100, 1696, '#654321'), back: await png(1131, 1696, '#abcdef'), layout, spineFit: 1, stretched: false }
    }
    const ai: AiTools = { ...noAi, generateJacket: jacket }
    const first = await run({ ai: true, now: true }, ai)
    expect(generated).toBe(2)
    expect(first.aiImages).toBe(2)
    expect(book(first.library, 'b').assets).toMatchObject({ spine: '9780000000002/spine.webp', back: '9780000000002/back.webp', source: 'ai' })

    const forced = await run({ ai: true, now: true, force: true }, ai)
    expect(generated).toBe(2)
    expect(book(forced.library, 'b').assets?.back).toBe('9780000000002/back.webp')
  })

  it('--limit enriches only the most recently read Books; the rest pass through re-based', async () => {
    const result = await run({ limit: 1 })
    expect(result.built).toBe(1)
    expect(book(result.library, 'a').assets?.front).toBe('9780000000001/front.webp')
    expect(book(result.library, 'b').assets?.front).toBe('../in/img/b-front.png')
  })
})
