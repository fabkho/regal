// Pile variants of an asset set. The Stack only ever shows a Book's Spine and,
// for the top Book, its front, each a few hundred pixels tall on screen, so
// the client loads these small copies first and the full faces only when a
// Book is taken out. The manifest also carries the Spine colours (taken from
// the front, as the client would) and the Spine art's average colour, so a
// Spine without art is final before any image has loaded.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { spinePalette, toHex } from '../../app/utils/covers/palette'

/** Pixel height of the pile front: the top Book's cover, seen at a slant. */
export const PILE_FRONT_HEIGHT = 512
/** Pixel height of the pile Spine: about twice what a Spine spans on a 2× screen, even picked. */
export const PILE_SPINE_HEIGHT = 768

export interface PileFields {
  /** Small copies for the pile (URLs relative to the assets base). */
  pile?: { front?: string, spine?: string }
  /** Spine colours from the front, as hex. */
  palette?: { background: string, text: string, accent: string }
  /** Average colour of the Spine art, as hex (the cover boards on the page edges). */
  spineColor?: string
  front?: string
  spine?: string
}

/** Spine colours of a front, sampled like the client does (48 × 72 pixels). */
export async function frontPalette(image: Buffer): Promise<NonNullable<PileFields['palette']>> {
  const { data, info } = await sharp(image).resize(48, 72, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const colours = spinePalette(data, info.width, info.height)
  return { background: toHex(colours.background), text: toHex(colours.text), accent: toHex(colours.accent) }
}

/** Average colour of an image, as hex. */
export async function averageHex(image: Buffer): Promise<string> {
  const { data } = await sharp(image).resize(8, 8, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const sum = [0, 0, 0]
  for (let i = 0; i < data.length; i += 3) {
    sum[0]! += data[i]!
    sum[1]! += data[i + 1]!
    sum[2]! += data[i + 2]!
  }
  const pixels = data.length / 3
  return toHex(sum.map(channel => channel / pixels) as [number, number, number])
}

/** File name of a face's pile copy: front.webp → front-pile.webp. */
export const pileName = (path: string) => path.replace(/\.webp$/, '-pile.webp')

const newer = (source: string, copy: string) => !existsSync(copy) || statSync(source).mtimeMs > statSync(copy).mtimeMs

/**
 * Brings an entry's pile copies and colours up to date with its faces. Only
 * work that is missing or stale is done; returns whether the entry changed.
 */
export async function updatePile(out: string, entry: PileFields): Promise<boolean> {
  const before = JSON.stringify([entry.pile, entry.palette, entry.spineColor])
  const pile: NonNullable<PileFields['pile']> = {}
  for (const [face, height, quality] of [['front', PILE_FRONT_HEIGHT, 80], ['spine', PILE_SPINE_HEIGHT, 82]] as const) {
    const path = entry[face]
    if (!path || !existsSync(join(out, path))) continue
    const source = join(out, path)
    const copy = join(out, pileName(path))
    const stale = newer(source, copy)
    if (stale) writeFileSync(copy, await sharp(source).resize({ height, withoutEnlargement: true }).webp({ quality }).toBuffer())
    pile[face] = pileName(path)
    if (face === 'front' && (stale || !entry.palette)) entry.palette = await frontPalette(readFileSync(source))
    if (face === 'spine' && (stale || !entry.spineColor)) entry.spineColor = await averageHex(readFileSync(source))
  }
  if (pile.front || pile.spine) entry.pile = pile
  else delete entry.pile
  if (!pile.front) delete entry.palette
  if (!pile.spine) delete entry.spineColor
  return JSON.stringify([entry.pile, entry.palette, entry.spineColor]) !== before
}
