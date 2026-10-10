// What RegalBooksDeal's Books wear, made before the motion starts (nothing is
// drawn or uploaded while it plays): the front (the host's image, small, or a
// drawn one), the Spine and the page edges as the Stack's Books have them, a
// back. Browser only (canvas, three textures). The covers come through Regal's
// own loader (utils/covers/coverTextures.ts: CORS fetch, decoded off the main
// thread, cached per URL for the page): a front that is not in by the deadline
// is drawn instead and never swapped in later.
import { CanvasTexture, Color, MeshPhysicalMaterial, MeshStandardMaterial, SRGBColorSpace } from 'three'
import type { Material, Texture } from 'three'
import { averageColor, drawFront, drawSpine, spineFontsReady } from '../covers/bookFaces'
import type { FaceInput } from '../covers/bookFaces'
import { loadCover, loadFullCover, releaseFullCover } from '../covers/coverTextures'
import type { LoadedCover } from '../covers/coverTextures'
import { fromHex, readableOn } from '../covers/palette'
import type { RGB, SpinePalette } from '../covers/palette'
import { drawPageEdges, pageEdgePlan } from '../books/pageEdges'
import { CLOTH_COLORS, hashString } from '../bookcase/layout'
import type { DealBook } from './book'
import type { DealDims, DealVariantName } from './types'

// The Stack's look (components/row/Books.vue).
const CLOTH_ALBEDO = 0.3
const COVER_ALBEDO = 0.55
const FACE_ALBEDO = 0.42
const PAPER_ALBEDO = 0.78
const HEAD_DUST = 0.9
const PAGE_BUMP = 0.5

/** The most the covers may take to arrive (ms), then the rest are drawn. */
export const COVER_DEADLINE = 1200
/** Spine canvases at this share of their full size: the deal never shows a Spine large. */
const SPINE_RESOLUTION = 0.75

export interface DealBookFaces {
  /** [front, back, head, tail, spine, fore]: the box's face order. */
  materials: Material[]
  /** The cover came from the host's image (not drawn). */
  fromImage: boolean
}

export interface DealAssets {
  books: DealBookFaces[]
  /** Every texture to upload before the first frame. */
  textures: Texture[]
  /** How many covers came in time. */
  loaded: number
  /** Frees what the deal made (never the page's shared cover textures). */
  dispose: () => void
}

export interface PrepareOptions {
  variant: DealVariantName
  winner: number
  /** Ms to wait for the covers (default COVER_DEADLINE). */
  deadline?: number
}

function texture(canvas: HTMLCanvasElement, anisotropy = 8): CanvasTexture {
  const made = new CanvasTexture(canvas)
  made.colorSpace = SRGBColorSpace
  made.anisotropy = anisotropy
  return made
}

/** The back every Book wears in the deck: one card back, ink with a hairline of the accent. */
function drawDeckBack(): HTMLCanvasElement {
  const width = 268
  const height = 400
  const element = document.createElement('canvas')
  element.width = width
  element.height = height
  const context = element.getContext('2d')!
  context.fillStyle = '#2C2C2A'
  context.fillRect(0, 0, width, height)
  const inset = 16
  context.strokeStyle = '#B93E2E'
  context.lineWidth = 2
  context.strokeRect(inset, inset, width - inset * 2, height - inset * 2)
  context.strokeStyle = 'rgba(185, 62, 46, 0.55)'
  context.lineWidth = 1
  context.strokeRect(inset + 7, inset + 7, width - (inset + 7) * 2, height - (inset + 7) * 2)
  // A lattice of diamonds.
  context.save()
  context.beginPath()
  context.rect(inset + 12, inset + 12, width - (inset + 12) * 2, height - (inset + 12) * 2)
  context.clip()
  context.strokeStyle = 'rgba(245, 242, 235, 0.16)'
  const step = 26
  for (let offset = -height; offset < width + height; offset += step) {
    context.beginPath()
    context.moveTo(offset, 0)
    context.lineTo(offset + height, height)
    context.moveTo(offset + height, 0)
    context.lineTo(offset, height)
    context.stroke()
  }
  context.restore()
  // The mark in the middle.
  context.translate(width / 2, height / 2)
  context.rotate(Math.PI / 4)
  context.fillStyle = '#2C2C2A'
  context.fillRect(-30, -30, 60, 60)
  context.strokeStyle = '#B93E2E'
  context.lineWidth = 2
  context.strokeRect(-30, -30, 60, 60)
  context.fillStyle = '#B93E2E'
  context.fillRect(-9, -9, 18, 18)
  return element
}

function cloth(color: string): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({ roughness: 0.72, metalness: 0, transparent: true })
  material.color.set(color).multiplyScalar(CLOTH_ALBEDO)
  material.clearcoat = 0.12
  material.clearcoatRoughness = 0.6
  material.envMapIntensity = 0.35
  return material
}

function printed(map: Texture, albedo = FACE_ALBEDO): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({ map, color: new Color(1, 1, 1).multiplyScalar(albedo), roughness: 0.68, metalness: 0, transparent: true })
  material.clearcoat = 0.15
  material.clearcoatRoughness = 0.55
  material.envMapIntensity = 0.35
  return material
}

function coverMaterial(map: Texture): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({ map, color: new Color(1, 1, 1).multiplyScalar(COVER_ALBEDO), roughness: 0.5, metalness: 0, transparent: true })
  material.clearcoat = 0.35
  material.clearcoatRoughness = 0.35
  material.envMapIntensity = 0.35
  return material
}

function edgeMaterial(map: Texture, dust = 1): MeshStandardMaterial {
  return new MeshStandardMaterial({
    map,
    bumpMap: map,
    bumpScale: PAGE_BUMP,
    color: new Color(1, 1, 1).multiplyScalar(PAPER_ALBEDO * dust),
    roughness: 0.93,
    metalness: 0,
    envMapIntensity: 0.3,
    transparent: true,
  })
}

const sleep = (ms: number) => new Promise<null>(resolve => setTimeout(resolve, ms))

/** The cloth colour of a Book: the host's, or one of Regal's by its Id. */
export function dealColor(book: Pick<DealBook, 'id' | 'color'>): string {
  return book.color && /^#[0-9a-f]{6}$/i.test(book.color) ? book.color : CLOTH_COLORS[hashString(book.id) % CLOTH_COLORS.length]!
}

/**
 * Loads what can be loaded in time and makes every Book's faces. Resolves once
 * all of it is ready to upload; never rejects (a Book that fails is drawn).
 */
export async function prepareDealAssets(books: readonly DealBook[], dims: readonly DealDims[], options: PrepareOptions): Promise<DealAssets> {
  const deadline = sleep(options.deadline ?? COVER_DEADLINE)
  const ownTextures: Texture[] = []
  const own = <T extends Texture>(made: T): T => {
    ownTextures.push(made)
    return made
  }
  let fullCoverUrl: string | null = null

  // Fonts and covers in parallel, all within the deadline.
  const [, covers] = await Promise.all([
    Promise.race([spineFontsReady(), deadline]),
    Promise.all(books.map(book => (book.coverUrl ? Promise.race<LoadedCover | null>([loadCover(book.coverUrl).catch(() => null), deadline]) : Promise.resolve(null)))),
  ])

  // The winner's front at full size when it comes in time (it ends 55 % of the stage tall).
  const winner = books[options.winner]
  let winnerFull: Texture | null = null
  if (winner?.coverUrl && covers[options.winner]) {
    const remaining = Promise.race<Texture | null>([loadFullCover(winner.coverUrl).catch(() => null), sleep(450)])
    winnerFull = await remaining
    if (winnerFull) fullCoverUrl = winner.coverUrl
  }

  const deckBack = options.variant === 'deck' ? own(texture(drawDeckBack(), 4)) : null
  let loaded = 0
  const textures: Texture[] = []

  const faces = books.map((book, index): DealBookFaces => {
    const dim = dims[index]!
    const loadedCover = covers[index] ?? null
    if (loadedCover) loaded++
    const color = dealColor(book)
    const background: RGB = loadedCover?.palette.background ?? fromHex(color)
    const palette: SpinePalette = loadedCover?.palette ?? { background, text: readableOn(background), accent: readableOn(background) }
    const faceBook = { id: book.id, title: book.title, seriesTitle: book.seriesTitle ?? null, author: book.author ?? null, isbn13: null }

    // Front: the image, or drawn.
    let front: Texture
    if (index === options.winner && winnerFull) {
      front = winnerFull
    }
    else if (loadedCover) {
      front = loadedCover.texture
    }
    else {
      front = own(texture(drawFront({ book: faceBook, palette, height: 640 }), 8))
    }
    textures.push(front)

    const input: FaceInput = {
      book: faceBook,
      thickness: dim.thickness,
      height: dim.height,
      depth: dim.depth,
      palette,
      cover: loadedCover?.image,
      seed: hashString(book.id),
      resolution: SPINE_RESOLUTION,
    }
    const spine = own(texture(drawSpine(input)))
    const board = loadedCover ? averageColor(loadedCover.image) : background
    const plan = pageEdgePlan({ id: book.id, pages: book.pages ?? null, binding: book.binding ?? null }, dim.thickness, dim.depth)
    const edges = own(texture(drawPageEdges(plan, board, book.id)))
    const tail = own(edges.clone())
    tail.repeat.set(1, -1)
    tail.offset.set(0, 1)
    const fore = own(edges.clone())
    fore.repeat.set(1, 0.5)
    fore.offset.set(0, 0.25)
    for (const map of [edges, tail, fore]) map.needsUpdate = true

    textures.push(spine, edges, tail, fore)
    if (deckBack && index === 0) textures.push(deckBack)

    const back = deckBack ? printed(deckBack, 0.5) : cloth(color)
    return {
      fromImage: !!loadedCover,
      materials: [coverMaterial(front), back, edgeMaterial(edges, HEAD_DUST), edgeMaterial(tail), printed(spine), edgeMaterial(fore)],
    }
  })

  let disposed = false
  return {
    books: faces,
    textures,
    loaded,
    dispose() {
      if (disposed) return
      disposed = true
      for (const face of faces) for (const material of face.materials) material.dispose()
      for (const made of ownTextures) made.dispose()
      if (fullCoverUrl) releaseFullCover(fullCoverUrl)
    },
  }
}
