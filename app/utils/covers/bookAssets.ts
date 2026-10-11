// A Book's resolved faces from the Regal library file (`assets` of each Book,
// docs/library-file.md): real or AI-made images and the Spine colours. A face
// that's present replaces the drawn one; a missing one is drawn (placeholder
// front, typeset Spine and back).
//
// The small pile copies of the front and Spine and the Spine colours are
// optional: without them the full faces and colours sampled from the front
// stand in. A Book with one colour (`color`, no Spine art) has flat faces:
// Spine and back in that colour, typeset, no image but the front.
import { fromHex, readableOn } from './palette'
import type { RGB, SpinePalette } from './palette'

export type AssetSource = 'photo' | 'ai'

/** A face of the Book that the owner photographed rather than us generating it. */
export type PhotoFace = 'front' | 'spine' | 'back'

/** A line of praise from the publisher copy, printed on the back cover. */
export interface AssetQuote {
  text: string
  source: string
}

/** What the display knows about a Book's faces: its `assets` plus the back-cover extras. */
export interface BookAssetEntry {
  /** Image references as in the library file: absolute or relative to its URL. */
  front?: string
  spine?: string
  back?: string
  source?: AssetSource
  /** Up to two verified praise quotes from the publisher description. */
  quotes?: AssetQuote[]
  /** Shelf category as printed on a back cover: 'SCIENCE FICTION'. */
  genre?: string
  /** Publisher imprint, as printed at the foot of the back cover. */
  publisher?: string
  /** Faces that come from the owner's own photographs: drawn as they are. */
  photoFaces?: PhotoFace[]
  /** Small copies for the pile: the front and Spine at a few hundred pixels. */
  pile?: { front?: string, spine?: string }
  /** Spine colours taken from the front, as hex. */
  palette?: { background: string, text: string, accent: string }
  /** Average colour of the Spine art, as hex. */
  spineColor?: string
  /** The Book's one colour, as hex: Spine and back drawn flat in it (library file `assets.color`). */
  color?: string
}

/** True when `face` of this Book is a photo of the real thing, not artwork. */
export const isPhotoFace = (entry: BookAssetEntry | null | undefined, face: PhotoFace): boolean =>
  Boolean(entry?.photoFaces?.includes(face))

/** Where a Book's faces are and what the library file already knows about them. */
export interface AssetFaces {
  entry: BookAssetEntry
  /** The Spine art for the pile (its small copy when there is one). */
  spine?: string
  /** The front for the pile (its small copy when there is one). */
  pileFront?: string
  /** The front at full size, for a Book taken out. */
  front?: string
  back?: string
  /** Spine colours from the file; null when they must come from the front. */
  palette: SpinePalette | null
  /** Average colour of the Spine art, from the file. */
  spineColor: RGB | null
  /**
   * The Book's one colour (`assets.color`): Spine and back drawn flat in it.
   * Null without it, or when the file has Spine art (art wins).
   */
  flat: RGB | null
}

const hex = (value: unknown): RGB | null => (typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? fromHex(value) : null)

/**
 * The faces of an entry, small pile copies preferred. `url` resolves an image
 * reference (against the library file's URL); null drops it.
 */
export function assetFaces(entry: BookAssetEntry, url: (reference: string) => string | null): AssetFaces {
  const at = (reference: string | undefined) => (reference ? url(reference) ?? undefined : undefined)
  const [background, text, accent] = [entry.palette?.background, entry.palette?.text, entry.palette?.accent].map(hex)
  const color = hex(entry.color)
  // Art wins over the one colour: a Book with Spine art keeps it.
  const flat = color && !entry.spine && !entry.pile?.spine ? color : null
  const palette = background && text && accent ? { background, text, accent } : null
  return {
    entry,
    spine: at(entry.pile?.spine ?? entry.spine),
    pileFront: at(entry.pile?.front ?? entry.front),
    front: at(entry.front),
    back: at(entry.back),
    // A flat Book's Spine is final without its front: its colour and the ink that reads on it.
    palette: flat ? { background: flat, text: readableOn(flat), accent: readableOn(flat) } : palette,
    spineColor: hex(entry.spineColor) ?? flat,
    flat,
  }
}
