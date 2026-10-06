// How a row dresses a Book's Spine and page edges, shared by the row
// (components/row/Books.vue) and preloadRegal (utils/preload.ts), which draws
// the first ones ahead into the page's face cache (utils/row/faceCache.ts):
// both must draw the same canvases under the same keys.
import type { Book } from '#layers/regal/shared/types/book'
import type { BookPose } from '#layers/regal/app/utils/books/pose'
import { hashString } from '#layers/regal/app/utils/bookcase/layout'
import { averageColor } from '#layers/regal/app/utils/covers/bookFaces'
import type { FaceInput } from '#layers/regal/app/utils/covers/bookFaces'
import { isPhotoFace } from '#layers/regal/app/utils/covers/bookAssets'
import type { AssetFaces } from '#layers/regal/app/utils/covers/bookAssets'
import type { LoadedCover } from '#layers/regal/app/utils/covers/coverTextures'
import type { Picture } from '#layers/regal/app/utils/covers/images'
import { fromHex, readableOn } from '#layers/regal/app/utils/covers/palette'
import type { RGB } from '#layers/regal/app/utils/covers/palette'
import { ROW_CAMERA } from '#layers/regal/app/utils/row/layout'
import { edgeKey, spineKey } from '#layers/regal/app/utils/row/faceCache'

/** Pixel height full-size Spine art is decoded at (its small pile copy as it comes). */
export const ART_HEIGHT = 1024

/** Spine resolutions a row draws at (shares of the full size), in steps so a resize doesn't redraw. */
const SPINE_STEPS = [0.375, 0.5, 0.75, 1]

/**
 * Spine LOD: the Stack draws Spine art 1024 px tall; a card shows a Book a
 * couple of hundred CSS px tall. Drawn at what a card `cardHeight` CSS px
 * tall needs at `pixelRatio` (the canvas', capped by the render quality),
 * with a little to spare.
 */
export function rowSpineScale(cardHeight: number, pixelRatio: number): number {
  const pxPerMetre = (cardHeight || 300) / ROW_CAMERA.viewHeight
  const needed = 0.24 * pxPerMetre * pixelRatio * 1.2
  return SPINE_STEPS.find(step => step * 1024 >= needed) ?? 1
}

export interface RowFaceParts {
  set?: AssetFaces | null
  loaded?: LoadedCover | null
  description?: string | null
  spineArt?: Picture
  backArt?: Picture
}

/** What bookFaces draws a row Book's Spine (and back) from. */
export function rowFaceInput(book: Book, pose: BookPose, parts: RowFaceParts = {}): FaceInput {
  const background = fromHex(pose.color)
  const text = readableOn(background)
  const set = parts.set
  return {
    book,
    thickness: pose.thickness,
    height: pose.height,
    depth: pose.depth,
    palette: set?.palette ?? parts.loaded?.palette ?? { background, text, accent: text },
    cover: parts.loaded?.image,
    seed: hashString(book.id),
    description: parts.description ?? null,
    spineArt: parts.spineArt,
    backArt: parts.backArt,
    quotes: set?.entry.quotes,
    genre: set?.entry.genre,
    publisher: set?.entry.publisher,
    backIsPhoto: isPhotoFace(set?.entry, 'back'),
    spineIsPhoto: isPhotoFace(set?.entry, 'spine'),
  }
}

/**
 * A Spine that can be drawn without the front: the library file gives its
 * colours (palette). The others take theirs from the front, which only the row loads.
 */
export const drawsWithoutFront = (set: AssetFaces | null | undefined): set is AssetFaces => !!set?.palette

/** The colour a Spine drawn without the front gives its page edges: the file's, else its art's, else the palette's. */
export function edgesBoard(set: AssetFaces, art: Picture | null | undefined): RGB {
  return set.spineColor ?? (art ? averageColor(art) : set.palette!.background)
}

/** Where a Book's drawn Spine and page edges are kept in the page's cache. */
export function rowFaceKeys(book: Pick<Book, 'id' | 'title' | 'author' | 'seriesTitle'>, pose: BookPose, set: AssetFaces | null | undefined, scale: number): { spine: string, edges: string } {
  const color = set?.spineColor ? `${set.spineColor}` : set?.palette ? `${set.palette.background}` : null
  const text = `${book.title}|${book.author ?? ''}|${book.seriesTitle ?? ''}`
  return {
    spine: spineKey(book.id, scale, pose.thickness, pose.height, set?.spine, color, text),
    edges: edgeKey(book.id, pose.thickness, pose.depth, set?.spine, color),
  }
}
