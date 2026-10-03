import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { jacketPlaceholderShare, PLACEHOLDER_LIMIT, placeholderShare } from '../../scripts/assets/jacket'

const flat = (background: string, width = 100, height = 150) =>
  sharp({ create: { width, height, channels: 3, background } }).webp({ quality: 90 }).toBuffer()

async function band(base: string, colour: string, share: number) {
  const width = 200
  const bandWidth = Math.round(width * share)
  const strip = await sharp({ create: { width: bandWidth, height: 300, channels: 3, background: colour } }).png().toBuffer()
  return sharp({ create: { width, height: 300, channels: 3, background: base } })
    .composite([{ input: strip, left: width - bandWidth, top: 0 }])
    .webp({ quality: 90 })
    .toBuffer()
}

describe('placeholder detection', () => {
  it('finds no placeholder in painted art', async () => {
    expect(await placeholderShare(await flat('#2C3E50'))).toBe(0)
    expect(await placeholderShare(await flat('#3FA7B5'))).toBe(0)
  })

  it('measures a leftover cyan or magenta band', async () => {
    expect(await placeholderShare(await band('#202020', '#00FFFF', 0.25))).toBeGreaterThan(0.2)
    expect(await placeholderShare(await band('#202020', '#FF00FF', 0.5))).toBeGreaterThan(0.45)
  })

  it('rejects a jacket when either face is over the limit', async () => {
    const clean = await flat('#553311')
    expect(await jacketPlaceholderShare({ spine: clean, back: clean })).toBeLessThanOrEqual(PLACEHOLDER_LIMIT)
    expect(await jacketPlaceholderShare({ spine: await flat('#00FFFF', 20, 150), back: clean })).toBeGreaterThan(PLACEHOLDER_LIMIT)
  })
})
