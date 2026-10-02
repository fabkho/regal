import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, describe, expect, it } from 'vitest'
import { averageHex, frontPalette, PILE_FRONT_HEIGHT, PILE_SPINE_HEIGHT, pileName, updatePile } from '../../scripts/assets/pile'
import type { PileFields } from '../../scripts/assets/pile'

/** Largest channel difference between two hex colours (WebP shifts colours a little). */
const off = (a: string | undefined, b: string) => Math.max(...[1, 3, 5].map(i => Math.abs(Number.parseInt(a?.slice(i, i + 2) ?? '0', 16) - Number.parseInt(b.slice(i, i + 2), 16))))

const out = mkdtempSync(join(tmpdir(), 'regal-pile-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

/** A synthetic face: a solid colour with a band of another down its left edge. */
async function face(width: number, height: number, ground: string, edge: string): Promise<Buffer> {
  const band = await sharp({ create: { width: Math.round(width * 0.1), height, channels: 3, background: edge } }).png().toBuffer()
  return sharp({ create: { width, height, channels: 3, background: ground } })
    .composite([{ input: band, left: 0, top: 0 }])
    .webp({ quality: 95 })
    .toBuffer()
}

describe('pile copies', () => {
  it('names the pile copy next to its face', () => {
    expect(pileName('9780756413026/front.webp')).toBe('9780756413026/front-pile.webp')
    // Any other image still gets a WebP copy beside it, never its own name.
    expect(pileName('k/front.jpg')).toBe('k/front-pile.webp')
    expect(pileName('k.v2/spine')).toBe('k.v2/spine-pile.webp')
  })

  it('samples the Spine colours from the front\'s left edge and averages the Spine art', async () => {
    const front = await face(1000, 1600, '#f0e6c8', '#203050')
    const palette = await frontPalette(front)
    expect(off(palette.background, '#203050')).toBeLessThan(4)
    expect(palette.text).toMatch(/^#[0-9a-f]{6}$/)
    expect(off(await averageHex(await sharp({ create: { width: 60, height: 1600, channels: 3, background: '#804020' } }).png().toBuffer()), '#804020')).toBe(0)
  })

  it('writes small copies and colours once, and again only when a face changes', async () => {
    mkdirSync(join(out, 'k'))
    writeFileSync(join(out, 'k/front.webp'), await face(1000, 1600, '#f0e6c8', '#203050'))
    writeFileSync(join(out, 'k/spine.webp'), await face(90, 1600, '#804020', '#804020'))
    const entry: PileFields = { front: 'k/front.webp', spine: 'k/spine.webp' }
    expect(await updatePile(out, entry)).toBe(true)
    expect(entry.pile).toEqual({ front: 'k/front-pile.webp', spine: 'k/spine-pile.webp' })
    expect((await sharp(join(out, 'k/front-pile.webp')).metadata()).height).toBe(PILE_FRONT_HEIGHT)
    expect((await sharp(join(out, 'k/spine-pile.webp')).metadata()).height).toBe(PILE_SPINE_HEIGHT)
    expect(off(entry.spineColor, '#804020')).toBeLessThan(4)
    const copied = statSync(join(out, 'k/spine-pile.webp')).mtimeMs

    // Nothing changed: nothing is written.
    expect(await updatePile(out, entry)).toBe(false)
    expect(statSync(join(out, 'k/spine-pile.webp')).mtimeMs).toBe(copied)

    // New Spine art (the AI Spines to come): a new copy and colour.
    writeFileSync(join(out, 'k/spine.webp'), await face(90, 1600, '#205080', '#205080'))
    const later = new Date(Date.now() + 5000)
    utimesSync(join(out, 'k/spine.webp'), later, later)
    expect(await updatePile(out, entry)).toBe(true)
    expect(off(entry.spineColor, '#205080')).toBeLessThan(4)
  })

  it('leaves an entry without faces alone, and drops copies of faces that went', async () => {
    const entry: PileFields = { pile: { front: 'gone/front-pile.webp' }, palette: { background: '#000000', text: '#ffffff', accent: '#ffffff' } }
    expect(await updatePile(out, entry)).toBe(true)
    expect(entry.pile).toBeUndefined()
    expect(entry.palette).toBeUndefined()
    expect(await updatePile(out, {})).toBe(false)
  })
})
