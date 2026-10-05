<script setup lang="ts">
// The Books of a view (Bookcase Shelves or the Stack). One mesh per Book, all
// sharing a unit box scaled per pose, with per-Book cover / spine / back
// materials so the real Cover lands as soon as it loads.
//
// Interaction (shared by both views):
// - hover: the Book eases towards you, tilts a little and catches the light
//   (gloss up + a glint sweeping along it);
// - click: it slides out and comes to the camera showing its front Cover;
//   click again for the back, a third time to put it away (after
//   mawise/bookshelf); drag to spin it; Escape or empty space puts it away.
//   Clicks are told from drags and raycast by useBookClicks.
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Euler,
  MathUtils,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three'
import type { Group, Material, Mesh, PerspectiveCamera, PointLight, Texture } from 'three'
import { useLoop, useTres } from '@tresjs/core'
import gsap from 'gsap'
import type { Book } from '#layers/regal/shared/types/book'
import { hashString } from '#layers/regal/app/utils/bookcase/layout'
import type { BookPose } from '#layers/regal/app/utils/books/pose'
import { inspectFrame } from '#layers/regal/app/utils/books/inspect'
import { planShuffle, presenceAt, sampleTrack } from '#layers/regal/app/utils/stack/shuffle'
import { chooseShuffle, countMoves } from '#layers/regal/app/utils/stack/moves'
import type { ShufflePlan, ShuffleView } from '#layers/regal/app/utils/stack/shuffle'
import { averageColor, drawBack, drawSpine, spineFontsReady } from '#layers/regal/app/utils/covers/bookFaces'
import type { FaceInput } from '#layers/regal/app/utils/covers/bookFaces'
import { loadCover, loadFullCover, prefetchFullCover, releaseFullCover } from '#layers/regal/app/utils/covers/coverTextures'
import { isPhotoFace } from '#layers/regal/app/utils/covers/bookAssets'
import type { AssetFaces } from '#layers/regal/app/utils/covers/bookAssets'
import { decodeImage, fetchImage, loadPicture } from '#layers/regal/app/utils/covers/images'
import type { Picture } from '#layers/regal/app/utils/covers/images'
import { drawPageEdges, pageEdgePlan } from '#layers/regal/app/utils/books/pageEdges'
import type { PageEdgePlan } from '#layers/regal/app/utils/books/pageEdges'
import { backDrawDue } from '#layers/regal/app/utils/books/backs'
import { CLICK_SLOP } from '#layers/regal/app/utils/books/press'
import { reschedule, setBands } from '#layers/regal/app/utils/covers/loadQueue'
import type { Priority } from '#layers/regal/app/utils/covers/loadQueue'
import { inView, LOAD_BANDS, loadRank } from '#layers/regal/app/utils/covers/loadWindow'
import type { Boost, FaceUse } from '#layers/regal/app/utils/covers/loadWindow'
import { STACK_SCROLL } from '#layers/regal/app/utils/stack/scrollHighlight'
import { createGlintSettle, GLINT_DELAY, glintDelay, settledGlint } from '#layers/regal/app/utils/stack/glintSettle'
import type { LoadedCover } from '#layers/regal/app/utils/covers/coverTextures'
import { fromHex, readableOn } from '#layers/regal/app/utils/covers/palette'
import type { RGB } from '#layers/regal/app/utils/covers/palette'

const props = withDefaults(defineProps<{
  poses: BookPose[]
  books: Book[]
  /** Move a picked Book left of centre, clear of a details card on the right. */
  aside?: boolean
  /** How a re-sorted Stack moves: 'animate' plays a collision-free plan (by hand or carousel), 'instant' jumps. */
  shuffle?: 'animate' | 'instant'
  /** ?debug=loads: logs every change to a face the pile shows, and whether it was on screen (window.__regalLoads). */
  debugLoads?: boolean
}>(), { aside: true, shuffle: 'instant', debugLoads: false })

/** Hovered Book, shared with the hover label and the Book list (hovering a record lifts its Book). */
const hoveredBook = useState<string | null>('books:hovered', () => null)
/** Each Book's faces from the library file, URLs resolved. */
const { facesOf } = useLibrary()

// --- Look ------------------------------------------------------------------

/**
 * The scene lighting is tuned for the dark wood, so full-strength colours read
 * as pastels. Real book cloth and printed covers reflect much less light than
 * their nominal colour suggests.
 */
const CLOTH_ALBEDO = 0.3
const COVER_ALBEDO = 0.55
/** Generated Spine/back textures carry their colour in the texture. */
const FACE_ALBEDO = 0.42
/** Page edges: the paper colour lives in the texture; the head collects a little dust. */
const PAPER_ALBEDO = 0.78
const HEAD_DUST = 0.9
/** How strongly the sheet lines catch the light. */
const PAGE_BUMP = 0.5

interface Gloss { clearcoat: number, clearcoatRoughness: number, envMapIntensity: number }
const CLOTH_GLOSS: Gloss = { clearcoat: 0.12, clearcoatRoughness: 0.6, envMapIntensity: 0.35 }
const PRINTED_GLOSS: Gloss = { clearcoat: 0.15, clearcoatRoughness: 0.55, envMapIntensity: 0.35 }
const COVER_GLOSS: Gloss = { clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.35 }
/** What a hovered Book gains: a varnish catching the light. */
const HOVER_GLOSS: Gloss = { clearcoat: 0.55, clearcoatRoughness: -0.3, envMapIntensity: 0.9 }

// --- Motion ----------------------------------------------------------------

/** How far a hovered Book comes towards you, and how much it tilts. */
const HOVER_OUT = 0.035
const HOVER_TILT = 0.045
/** First phase of a pick: slide straight out before flying to the camera. */
const PULL_OUT = 0.2
const PULL_PHASE = 0.3
const OUT_SECONDS = 1.2
const RETURN_SECONDS = 0.9
const FLIP_SECONDS = 0.7
const SPIN_PER_PX = 0.01

const geometry = new BoxGeometry(1, 1, 1)

interface BookMaterials {
  /** BoxGeometry face order: +x (front cover), -x (back), +y, -y, +z (spine, facing the room), -z (fore-edge). */
  faces: Material[]
  cover: MeshPhysicalMaterial
  back: MeshPhysicalMaterial
  spine: MeshPhysicalMaterial
  spineTexture: CanvasTexture
  backTexture: CanvasTexture
  /** Page edges: one canvas, three views of it (head, tail, fore-edge). */
  edges: {
    plan: PageEdgePlan
    canvas: HTMLCanvasElement
    textures: CanvasTexture[]
    /** Head, tail and fore edge. */
    materials: [MeshStandardMaterial, MeshStandardMaterial, MeshStandardMaterial]
  }
  /** The Book's faces from the library file; null when it has none. */
  set: AssetFaces | null
  /** Asset set artwork (real or AI), as it arrives. */
  art: { spine?: Picture, back?: Picture }
  /** The blurb once it has arrived, for redraws. */
  description?: string | null
  /** Last loaded Cover (null until/unless there is one), reused for redraws. */
  loaded: LoadedCover | null
  /** The faces the pile shows are final (the entrance waits for those in view). */
  ready: boolean
  /** URL of the full-size Cover on the picked Book. */
  fullCover: string | null
  /** The Stack's back for a Book about to be or being taken out (see prepareBack). */
  backPrep: BackPrep | null
  /** Aborted when the Book goes: its Spine and back art are no longer loaded. */
  aborted: AbortController
  /** Below 1 while the Book appears or vanishes. */
  opacity: number
}

interface Motion {
  /** Where the Book is drawn on its way to its pose (eased when the view re-sorts). */
  shown: { position: Vector3, quaternion: Quaternion, ready: boolean }
  hover: number
  pick: { value: number }
  flip: { value: number }
  spin: { x: number, y: number }
  glint: { value: number }
}

const materialsByBook = new Map<string, BookMaterials>()
const motionByBook = new Map<string, Motion>()
const meshes = new Map<string, Mesh>()
/** Books still shown though no longer in the view: on their way out of a re-sorted Stack. */
const extra = shallowRef<BookPose[]>([])
/** Every Book drawn: the view's own, then those on their way out. */
const rendered = computed(() => {
  if (extra.value.length === 0) return props.poses
  const inPoses = new Set(props.poses.map(pose => pose.bookId))
  return [...props.poses, ...extra.value.filter(pose => !inPoses.has(pose.bookId))]
})

function setGloss(material: MeshPhysicalMaterial, gloss: Gloss) {
  material.userData.gloss = gloss
  material.clearcoat = gloss.clearcoat
  material.clearcoatRoughness = gloss.clearcoatRoughness
  material.envMapIntensity = gloss.envMapIntensity
}

function applyShine(material: MeshPhysicalMaterial, amount: number) {
  const base = material.userData.gloss as Gloss
  material.clearcoat = base.clearcoat + HOVER_GLOSS.clearcoat * amount
  material.clearcoatRoughness = MathUtils.clamp(base.clearcoatRoughness + HOVER_GLOSS.clearcoatRoughness * amount, 0.05, 1)
  material.envMapIntensity = base.envMapIntensity + HOVER_GLOSS.envMapIntensity * amount
}

function cloth(color: string): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({ roughness: 0.72, metalness: 0 })
  material.userData.cloth = color
  material.color.set(color).multiplyScalar(CLOTH_ALBEDO)
  setGloss(material, CLOTH_GLOSS)
  return material
}

function printed(texture: CanvasTexture): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    map: texture,
    color: new Color(1, 1, 1).multiplyScalar(FACE_ALBEDO),
    roughness: 0.68,
    metalness: 0,
  })
  setGloss(material, PRINTED_GLOSS)
  return material
}

function faceTexture(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

const booksById = computed(() => new Map(props.books.map(book => [book.id, book])))

/**
 * The page edges of a Book. The canvas runs across the thickness (u on the
 * box's top, bottom and fore-edge alike) with the Spine's board along its
 * bottom rows: the head shows it as is, the tail mirrored, and the fore-edge
 * samples only the middle so no Spine board shows there.
 */
function pageEdgesFor(pose: BookPose, board: RGB): BookMaterials['edges'] {
  const book = booksById.value.get(pose.bookId)
  const plan = pageEdgePlan(book ?? { id: pose.bookId, pages: null, binding: null }, pose.thickness, pose.depth)
  const canvas = drawPageEdges(plan, board, pose.bookId)
  const head = faceTexture(canvas)
  const tail = head.clone()
  tail.repeat.set(1, -1)
  tail.offset.set(0, 1)
  const fore = head.clone()
  fore.repeat.set(1, 0.5)
  fore.offset.set(0, 0.25)
  const edge = (texture: CanvasTexture, dust = 1) => new MeshStandardMaterial({
    map: texture,
    bumpMap: texture,
    bumpScale: PAGE_BUMP,
    color: new Color(1, 1, 1).multiplyScalar(PAPER_ALBEDO * dust),
    roughness: 0.93,
    metalness: 0,
    envMapIntensity: 0.3,
  })
  return { plan, canvas, textures: [head, tail, fore], materials: [edge(head, HEAD_DUST), edge(tail), edge(fore)] }
}

/**
 * Puts a freshly drawn Spine or back canvas on its material. three.js
 * allocates texture storage once, so a canvas of a new size (artwork is drawn
 * at twice the resolution) needs a new texture rather than an update.
 */
function setFace(entry: BookMaterials, face: 'spine' | 'back', image: HTMLCanvasElement) {
  const key = face === 'spine' ? 'spineTexture' : 'backTexture'
  const current = entry[key]
  const old = current.image as HTMLCanvasElement
  if (old.width === image.width && old.height === image.height) {
    current.image = image
    current.needsUpdate = true
    return
  }
  const texture = faceTexture(image)
  entry[key] = texture
  entry[face].map = texture
  entry[face].needsUpdate = true
  current.dispose()
}

function redrawPageEdges(entry: BookMaterials, board: RGB, bookId: string) {
  drawPageEdges(entry.edges.plan, board, bookId, entry.edges.canvas)
  for (const texture of entry.edges.textures) texture.needsUpdate = true
}

function faceInput(pose: BookPose, entry: BookMaterials | null = null): FaceInput | null {
  const book = booksById.value.get(pose.bookId)
  if (!book) return null
  const background = fromHex(pose.color)
  const text = readableOn(background)
  const set = entry?.set
  return {
    book,
    thickness: pose.thickness,
    height: pose.height,
    depth: pose.depth,
    // The file's colours first: they don't change when the front arrives.
    palette: set?.palette ?? entry?.loaded?.palette ?? { background, text, accent: text },
    cover: entry?.loaded?.image,
    seed: hashString(book.id),
    description: entry?.description ?? null,
    spineArt: entry?.art.spine,
    backArt: entry?.art.back,
    // Asset set extras for a realistic back; photos of a real copy get no typography.
    quotes: set?.entry.quotes,
    genre: set?.entry.genre,
    publisher: set?.entry.publisher,
    backIsPhoto: isPhotoFace(set?.entry, 'back'),
    spineIsPhoto: isPhotoFace(set?.entry, 'spine'),
  }
}

/** A plain back in the Book's colour: it faces down in the pile, so its real one is drawn later. */
function plainBack(pose: BookPose): HTMLCanvasElement {
  const element = document.createElement('canvas')
  element.width = 2
  element.height = 2
  const context = element.getContext('2d')!
  context.fillStyle = pose.color
  context.fillRect(0, 0, 2, 2)
  return element
}

function materialsFor(pose: BookPose): Material[] {
  let entry = materialsByBook.get(pose.bookId)
  if (!entry) {
    const input = faceInput(pose)
    const cover = cloth(pose.color)
    const spineTexture = faceTexture(input ? drawSpine(input) : document.createElement('canvas'))
    const backTexture = faceTexture(plainBack(pose))
    const spine = printed(spineTexture)
    const back = printed(backTexture)
    const edges = pageEdgesFor(pose, fromHex(pose.color))
    const [head, tail, fore] = edges.materials
    entry = { cover, back, spine, spineTexture, backTexture, edges, set: null, art: {}, loaded: null, ready: false, fullCover: null, backPrep: null, aborted: new AbortController(), opacity: 1, faces: [cover, back, head, tail, spine, fore] }
    materialsByBook.set(pose.bookId, entry)
  }
  return entry.faces
}

function motionFor(bookId: string): Motion {
  let motion = motionByBook.get(bookId)
  if (!motion) {
    motion = { shown: { position: new Vector3(), quaternion: new Quaternion(), ready: false }, hover: 0, pick: { value: 0 }, flip: { value: 0 }, spin: { x: 0, y: 0 }, glint: { value: 1 } }
    motionByBook.set(bookId, motion)
  }
  return motion
}

/**
 * Dresses a Book as its faces arrive, most visible first (load ranks in
 * utils/covers/loadWindow.ts):
 * 1. the Spine colours and boards the library file lists, so a Spine without
 *    art is final before any image has loaded;
 * 2. the Spine art (its small pile copy);
 * 3. the front: right away for the top Book, or when the Spine colours must
 *    come from it (no colours in the file); else after the pile's faces;
 * 4. the back and its blurb, seen only once the Book is taken out: on the
 *    Bookcase (an end or a leaning Book shows it); the Stack draws it for the
 *    picked Book only (prepareBack).
 * Images decode off the main thread (utils/covers/images.ts). A face the file
 * has no image for (or whose image doesn't load) stays drawn.
 */
async function applyCover(pose: BookPose) {
  const book = booksById.value.get(pose.bookId)
  if (!book) return
  const set = facesOf(book.id)
  // Once the whole pile has its materials (as when faces waited for a manifest).
  await Promise.resolve()
  const entry = materialsByBook.get(pose.bookId)
  if (!entry || entry.aborted.signal.aborted) return
  entry.set = set
  if (set && !set.entry.pile && (set.front || set.spine)) fullSizeFaces = true

  const fonts = spineFontsReady()
  const frontShows = () => topBookId === pose.bookId || !set?.palette
  const shown = loadPriority(pose.bookId, 'shown')
  const hidden = loadPriority(pose.bookId, 'hidden')
  // The front's pile copy, the full front when that one fails; none: the drawn placeholder.
  const frontPriority = loadPriority(pose.bookId, () => (frontShows() ? 'shown' : 'hidden'))
  const front = (set?.pileFront ? loadCover(set.pileFront, frontPriority) : Promise.resolve(null))
    .then(loaded => loaded ?? (set?.front && set.front !== set.pileFront ? loadCover(set.front, frontPriority) : null))
  // Full-size Spine art (no pile copy) is scaled to what drawSpine uses.
  const signal = entry.aborted.signal
  const spineArt = set?.spine ? loadPicture(set.spine, shown, set.entry.pile?.spine ? undefined : ART_HEIGHT, signal) : null
  const draw = (paint: (entry: BookMaterials) => void) => whenDrawn(entry, pose.bookId, paint)

  // 1. The file's colours: Spine without art and page edges, final at once.
  if (set?.palette || set?.spineColor) {
    await fonts
    await draw((entry) => {
      redrawPageEdges(entry, set.spineColor ?? set.palette!.background, pose.bookId)
      noteShown(pose.bookId, 'edges')
      if (spineArt) return
      drawFace(pose, entry, 'spine')
      noteShown(pose.bookId, 'spine')
      entry.ready = !frontShows()
    })
  }

  // 2. The Spine art, with the colours it needs.
  if (spineArt) {
    const [art] = await Promise.all([spineArt, fonts, set?.palette ? null : front])
    const drawn = await draw((entry) => {
      if (art) entry.art.spine = art
      if (!set?.spineColor && art) redrawPageEdges(entry, averageColor(art), pose.bookId)
      drawFace(pose, entry, 'spine')
      noteShown(pose.bookId, 'spine')
      entry.ready = !frontShows()
    })
    // The Book went before its turn: nobody holds the bitmap.
    if (!drawn) return closePicture(art)
  }

  // 3. The front.
  const [loaded] = await Promise.all([front, fonts])
  const fronted = await draw((entry) => {
    entry.loaded = loaded
    if (loaded && !entry.fullCover) printCover(entry, loaded.texture)
    if (loaded && topBookId === pose.bookId) noteShown(pose.bookId, 'front')
    if (!set?.palette && !spineArt) {
      redrawPageEdges(entry, loaded?.palette.background ?? fromHex(pose.color), pose.bookId)
      drawFace(pose, entry, 'spine')
      noteShown(pose.bookId, 'spine')
    }
    entry.ready = true
  })
  if (!fronted || deferBacks) return

  // 4. The back and its blurb (from the file).
  const back = set?.back ? await loadPicture(set.back, hidden, ART_HEIGHT, signal) : null
  const drawn = await draw((entry) => {
    if (back) entry.art.back = back
    entry.description = book.description?.trim() || null
    drawFace(pose, entry, 'back')
  })
  if (!drawn) closePicture(back)
}

/** Frees a decoded bitmap nobody draws any more. */
function closePicture(picture: Picture | null | undefined) {
  if (picture && 'close' in picture && typeof picture.close === 'function') picture.close()
}

/** ?debug=loads: a face the pile shows (or the picked Book's back) changed; on screen, that is a visible pop. */
function noteShown(bookId: string, face: 'spine' | 'edges' | 'front' | 'back') {
  if (!props.debugLoads) return
  const y = poseHeights.get(bookId)
  const onScreen = !!stackScroll && y !== undefined && inView(y, stackScroll) && meshes.get(bookId)?.visible === true
  const log = ((window as { __regalLoads?: unknown[] }).__regalLoads ??= [])
  log.push({ t: Math.round(performance.now()), bookId, face, onScreen })
}

/** ?debug=loads: the entrance starts, with the Books in view and whether they all wear their faces. */
function noteEntrance(to: BookPose[]) {
  const shown = stackScroll ? to.filter(pose => inView(pose.y, stackScroll)) : []
  const log = ((window as { __regalLoads?: unknown[] }).__regalLoads ??= [])
  log.push({
    t: Math.round(performance.now()),
    face: 'entrance',
    waited: Math.round(performance.now() - entranceAskedAt),
    inView: shown.map(pose => pose.bookId),
    dressed: shown.every(pose => materialsByBook.get(pose.bookId)?.ready),
  })
}

/** Pixel height drawSpine and drawBack draw artwork at. */
const ART_HEIGHT = 1024

function drawFace(pose: BookPose, entry: BookMaterials, face: 'spine' | 'back') {
  const input = faceInput(pose, entry)
  if (input) setFace(entry, face, face === 'spine' ? drawSpine(input) : drawBack(input))
}

function disposeEntry(entry: BookMaterials) {
  // Cover textures stay cached in loadCover; everything per-Book goes.
  entry.cover.dispose()
  entry.back.dispose()
  entry.spine.dispose()
  entry.spineTexture.dispose()
  entry.backTexture.dispose()
  for (const texture of entry.edges.textures) texture.dispose()
  for (const material of entry.edges.materials) material.dispose()
  // Its Spine and back still queued or on their way are dropped.
  entry.aborted.abort()
  closePicture(entry.art.spine)
  closePicture(entry.art.back)
  closePicture(entry.backPrep?.picture)
  if (entry.fullCover) releaseFullCover(entry.fullCover)
}

// Load order: lazy, by the load window (utils/covers/loadWindow.ts): the
// picked Book, then the hovered one, then the faces the pile shows in and
// around the view, then the rest of the pile as a background fill, then the
// faces only seen once a Book is taken out. Ranks are read when a slot frees
// up, so the window moves with the scroll; the Bookcase loads in Shelf order.
const stackScroll = inject(STACK_SCROLL, null)
/** The Stack draws a back only for the picked Book (prepareBack); the Bookcase draws them all. */
const deferBacks = !!stackScroll
setBands(LOAD_BANDS)
/** Height of each Book in the current poses, for the load order. */
const poseHeights = new Map<string, number>()
/** The top Book of the pile: its front shows. */
let topBookId: string | null = null

function boostOf(bookId: string): Boost {
  if (pickedId.value === bookId) return 'picked'
  return hoveredBook.value === bookId ? 'hovered' : null
}

function loadPriority(bookId: string, use: FaceUse | (() => FaceUse)): Priority {
  return () => loadRank(poseHeights.get(bookId), stackScroll, typeof use === 'function' ? use() : use, boostOf(bookId))
}

// Drawing a face takes a few milliseconds; many arrive at once (all colours with
// the library file), so they wait their turn, nearest first, a few per frame.
const DRAW_BUDGET_MS = 6
const drawQueue: { bookId: string, run: () => void }[] = []

/**
 * Draws on a Book once it's its turn (see drawPending). Resolves whether it
 * drew: not when the Book has gone (filtered out, swapped) in the meantime,
 * and then whatever was to be drawn is the caller's to free.
 */
function whenDrawn(entry: BookMaterials, bookId: string, draw: (entry: BookMaterials) => void): Promise<boolean> {
  return new Promise(resolve => drawQueue.push({
    bookId,
    run: () => {
      const current = materialsByBook.get(bookId) === entry
      if (current) draw(entry)
      resolve(current)
    },
  }))
}

function drawPending() {
  if (!drawQueue.length) return
  const started = performance.now()
  // Nearest first: ranks taken once per frame, not per comparison.
  const ranks = new Map<string, number>()
  for (const item of drawQueue) {
    if (!ranks.has(item.bookId)) ranks.set(item.bookId, loadRank(poseHeights.get(item.bookId), stackScroll, 'shown', boostOf(item.bookId)))
  }
  drawQueue.sort((a, b) => ranks.get(a.bookId)! - ranks.get(b.bookId)!)
  while (drawQueue.length && performance.now() - started < DRAW_BUDGET_MS) drawQueue.shift()!.run()
}

watch(() => props.poses, (poses) => {
  let top: BookPose | null = null
  for (const pose of poses) {
    poseHeights.set(pose.bookId, pose.y)
    if (!top || pose.y > top.y) top = pose
    if (!materialsByBook.has(pose.bookId)) {
      materialsFor(pose)
      applyCover(pose)
    }
  }
  topBookId = top?.bookId ?? null
}, { immediate: true })

/** Frees the materials of Books that are neither in the view nor still on their way out. */
function sweep() {
  const keep = new Set(rendered.value.map(pose => pose.bookId))
  for (const [bookId, entry] of materialsByBook) {
    if (keep.has(bookId)) continue
    disposeEntry(entry)
    materialsByBook.delete(bookId)
    motionByBook.delete(bookId)
    // Gone from the pile: its remaining loads (shared Covers) rank last.
    poseHeights.delete(bookId)
  }
}

/** Fades a Book's faces; three.js only blends materials marked transparent. */
function setOpacity(entry: BookMaterials, opacity: number) {
  if (entry.opacity === opacity) return
  const blend = opacity < 1
  for (const material of entry.faces) {
    if (material.transparent !== blend) {
      material.transparent = blend
      material.needsUpdate = true
    }
    material.opacity = opacity
  }
  entry.opacity = opacity
}

// --- Interaction -------------------------------------------------------------

const { camera, controls, renderer } = useTres()
const { onBeforeRender } = useLoop()
const { pickedId, face, putAway } = useBookPick()
const reducedMotion = usePreferredReducedMotion()
const reduced = computed(() => reducedMotion.value === 'reduce')

// What covers the stage over the 3D (the controls' band, a phone's details
// sheet), as shares of its height, eased so the picked Book glides when the
// sheet's height changes rather than jumping.
const insets = useInspectInsets()
const inset = { top: 0, bottom: 0 }
function followInsets(rate: number) {
  const height = (renderer.domElement as HTMLElement | undefined)?.clientHeight
  if (!height) return
  inset.top += (insets.value.top / height - inset.top) * rate
  inset.bottom += (insets.value.bottom / height - inset.bottom) * rate
}

const glintLight = shallowRef<PointLight | null>(null)
const group = shallowRef<Group | null>(null)
/** Not drawn right now: waiting to appear in a re-sort (the raycaster still finds it). */
const unseen = (bookId: string) => meshes.get(bookId)?.visible === false

// A Book on its way into or out of the view (not drawn yet, or no longer in
// the poses) can't be taken out; clicks look through it.
useBookClicks(group, bookId => !unseen(bookId) && props.poses.some(pose => pose.bookId === bookId), onPress)
let hoveredId: string | null = null
/** Scroll highlight (Stack only): the Book on the focus line comes out like a hovered one. */
const highlight = useScrollHighlight()
const { focusedBook, scrollLed } = highlight

// The focused Book glints once the scroll has come to rest on it, a beat
// later (utils/stack/glintSettle.ts), not each Book a scroll passes. On the
// dev server ?glintDelay= (s) tunes the beat; production builds drop that.
const glintSettle = createGlintSettle()
const route = import.meta.dev ? useRoute() : null
const settleDelay = (): number => (import.meta.dev ? glintDelay(route!.query) : GLINT_DELAY)

function glint(bookId: string) {
  gsap.fromTo(motionFor(bookId).glint, { value: 0 }, { value: 1, duration: 0.9, ease: 'power1.inOut', overwrite: true })
}

function setMesh(bookId: string, element: unknown) {
  const object = (element as { isObject3D?: boolean } | null)?.isObject3D
    ? element as Mesh
    : (element as { value?: Mesh } | null)?.value
  if (object) meshes.set(bookId, object)
  else meshes.delete(bookId)
}

function setCursor(value: string) {
  const element = renderer.domElement as HTMLElement | undefined
  if (element) element.style.cursor = value
}

// Hover handlers take the Book from the event's mesh rather than a closure per
// Book: Tres adds a listener on every patch and never removes the old one, so
// handlers created per render pile up (one more call per re-sort).
type BookPointerEvent = { object?: { userData?: { bookId?: string } } }

/**
 * The kind of pointer last seen (read in the capture phase, before the scene
 * hands out its enter events). Touch has no hover: a finger sliding over the
 * pile enters Book after Book without pointing at any of them.
 */
let pointerType = 'mouse'
function notePointer(event: PointerEvent) {
  pointerType = event.pointerType
}

function onEnter(event: BookPointerEvent) {
  const bookId = event.object?.userData?.bookId
  if (!bookId) return
  if (unseen(bookId)) return
  hoveredId = bookId
  hoveredBook.value = bookId
  setCursor('pointer')
  // A Book the mouse enters glints at once: the user is pointing at it.
  if (reduced.value || pickedId.value === bookId || pointerType === 'touch') return
  glint(bookId)
}

function onLeave(event: BookPointerEvent) {
  const bookId = event.object?.userData?.bookId
  if (hoveredId === bookId) hoveredId = null
  if (hoveredBook.value === bookId) hoveredBook.value = null
  setCursor(dragging ? 'grabbing' : pickedId.value ? 'grab' : 'default')
}

function tween(target: { value: number }, value: number, seconds: number) {
  if (reduced.value) {
    gsap.killTweensOf(target)
    target.value = value
    return
  }
  gsap.to(target, { value, duration: seconds, ease: 'power2.inOut', overwrite: true })
}

watch(pickedId, (id, previous) => {
  if (previous) {
    const motion = motionFor(previous)
    tween(motion.pick, 0, RETURN_SECONDS)
    tween(motion.flip, 0, RETURN_SECONDS)
    gsap.to(motion.spin, { x: 0, y: 0, duration: reduced.value ? 0 : RETURN_SECONDS, ease: 'power2.inOut' })
  }
  if (id) {
    const motion = motionFor(id)
    motion.spin.x = 0
    motion.spin.y = 0
    motion.flip.value = 0
    tween(motion.pick, 1, OUT_SECONDS)
  }
  // Orbiting would fight the drag-to-spin gesture while a Book is out.
  if (controls.value) (controls.value as { enabled: boolean }).enabled = !id
  setCursor(id ? 'grab' : 'default')
})

// The pile shows small Covers; the picked Book gets its Cover at full size,
// and gives it back once it is back in place. A Book the pointer rests on
// fetches it ahead, so taking it out finds it ready.
const HOVER_PREFETCH_MS = 200

/** The picked Book's full-size front from the library file; none: it keeps what it shows. */
function fullCoverUrl(bookId: string): string | null {
  return materialsByBook.get(bookId)?.set?.front ?? null
}

/** Puts a Cover texture on the front board, printed (smoother, glossier than cloth). */
function printCover(entry: BookMaterials, texture: Texture) {
  entry.cover.map = texture
  entry.cover.color = new Color(1, 1, 1).multiplyScalar(COVER_ALBEDO)
  entry.cover.roughness = 0.5
  setGloss(entry.cover, COVER_GLOSS)
  entry.cover.needsUpdate = true
}

function setFullCover(bookId: string, on: boolean) {
  const entry = materialsByBook.get(bookId)
  if (!entry) return
  if (on) {
    const url = fullCoverUrl(bookId)
    if (!url) return
    entry.fullCover = url
    void loadFullCover(url, loadPriority(bookId, 'shown')).then((texture) => {
      const current = materialsByBook.get(bookId)
      if (texture && current?.fullCover === url) printCover(current, texture)
    })
    return
  }
  const url = entry.fullCover
  if (!url) return
  entry.fullCover = null
  // Back to the small Cover, or to cloth when that never came: never a freed texture.
  if (entry.loaded) printCover(entry, entry.loaded.texture)
  else clothCover(entry)
  releaseFullCover(url)
}

/** The plain cloth front a Book has until its Cover is in. */
function clothCover(entry: BookMaterials) {
  const plain = cloth(entry.cover.userData.cloth as string)
  entry.cover.map = null
  entry.cover.color.copy(plain.color)
  entry.cover.roughness = plain.roughness
  setGloss(entry.cover, CLOTH_GLOSS)
  entry.cover.needsUpdate = true
  plain.dispose()
}

// --- Backs (Stack) ---------------------------------------------------------------
// In the pile a back faces down: a Book keeps the plain back it starts with
// until it is taken out. A press or a resting mouse on a Book fetches its back
// art's bytes ahead; picking decodes them (off the main thread) and the back
// is drawn when utils/books/backs.ts says: once the Book has arrived in front
// of the camera, so the drawing never stutters its flight, or at once when
// the back is asked for sooner. Put back, the Book gives its drawn back up
// again, like the full Cover: a back is a canvas up to 686 × 1024 (~3.7 MB of
// GPU memory with mipmaps), and keeping every one ever looked at would bring
// back what this saves. Seeing it again costs a decode and a draw; the bytes
// come from the HTTP cache.

interface BackPrep {
  /** The back art's bytes, fetched ahead; null without art. */
  bytes: Promise<Blob | null>
  /** The decoded art: undefined until decoded, null without art. */
  picture: Picture | null | undefined
  decoding: boolean
  /** In the draw queue or drawn. */
  queued: boolean
  drawn: boolean
  /** Stops the fetch of a press that turned into a scroll. */
  aborted: AbortController
}

/** Starts fetching a Book's back art (Stack only). One Book ahead at most besides the picked one. */
function prepareBack(bookId: string): BackPrep | null {
  if (!deferBacks) return null
  const entry = materialsByBook.get(bookId)
  if (!entry) return null
  if (entry.backPrep) return entry.backPrep
  for (const [id, other] of materialsByBook) {
    if (id !== bookId && id !== pickedId.value && other.backPrep && !other.backPrep.queued) releaseBack(id)
  }
  const aborted = new AbortController()
  // The Book going stops it too; the listener goes with the prep.
  entry.aborted.signal.addEventListener('abort', () => aborted.abort(), { once: true, signal: aborted.signal })
  const url = entry.set?.back
  const prep: BackPrep = {
    bytes: url ? fetchImage(url, loadPriority(bookId, 'hidden'), aborted.signal) : Promise.resolve(null),
    picture: undefined,
    decoding: false,
    queued: false,
    drawn: false,
    aborted,
  }
  entry.backPrep = prep
  return prep
}

/** Decodes the picked Book's back art, off the main thread. */
function decodeBack(entry: BookMaterials, prep: BackPrep) {
  if (prep.decoding) return
  prep.decoding = true
  void prep.bytes
    .then(blob => (blob && !prep.aborted.signal.aborted ? decodeImage(blob, { height: ART_HEIGHT }) : null))
    .catch(() => null)
    .then((picture) => {
      if (entry.backPrep === prep) prep.picture = picture
      else closePicture(picture)
    })
}

/** Each frame: draws the picked Book's back once it is due (utils/books/backs.ts). */
function drawBackWhenDue() {
  const bookId = pickedId.value
  if (!deferBacks || !bookId) return
  const entry = materialsByBook.get(bookId)
  const prep = prepareBack(bookId)
  if (!entry || !prep) return
  decodeBack(entry, prep)
  const due = backDrawDue({ pick: motionFor(bookId).pick.value, face: face.value, artReady: prep.picture !== undefined, queued: prep.queued })
  const pose = due ? rendered.value.find(candidate => candidate.bookId === bookId) : undefined
  if (!pose) return
  prep.queued = true
  void whenDrawn(entry, bookId, (current) => {
    if (current.backPrep !== prep) return
    if (prep.picture) current.art.back = prep.picture
    current.description = booksById.value.get(bookId)?.description?.trim() || null
    drawFace(pose, current, 'back')
    noteShown(bookId, 'back')
    // On the canvas now: the bitmap goes (a later pick decodes anew).
    closePicture(current.art.back)
    current.art.back = undefined
    prep.picture = null
    prep.drawn = true
  })
}

/** Gives a Book's back up: the plain one again, the drawn canvas and any art freed. */
function releaseBack(bookId: string) {
  const entry = materialsByBook.get(bookId)
  const prep = entry?.backPrep
  if (!entry || !prep) return
  entry.backPrep = null
  prep.aborted.abort()
  closePicture(prep.picture)
  const pose = rendered.value.find(candidate => candidate.bookId === bookId)
  if (!prep.drawn || !pose) return
  const drawn = entry.backTexture.image as HTMLCanvasElement
  setFace(entry, 'back', plainBack(pose))
  drawn.width = 0
}

/** Where a press on a Book went down: its back is fetched, unless the press becomes a scroll. */
let pressed: { bookId: string, x: number, y: number } | null = null

function onPress(bookId: string | null, event: PointerEvent) {
  pressed = null
  if (!bookId || !deferBacks || pickedId.value === bookId) return
  prepareBack(bookId)
  pressed = { bookId, x: event.clientX, y: event.clientY }
}

/** A press that moved further than a click may has become a scroll: its back's fetch stops. */
function pressMoved(event: PointerEvent) {
  if (!pressed || Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) <= CLICK_SLOP) return
  const { bookId } = pressed
  pressed = null
  if (pickedId.value !== bookId && hoveredBook.value !== bookId) releaseBack(bookId)
}

watch(pickedId, (id, previous) => {
  if (id) setFullCover(id, true)
  if (previous && previous !== id) {
    setTimeout(() => {
      if (pickedId.value === previous) return
      setFullCover(previous, false)
      releaseBack(previous)
    }, RETURN_SECONDS * 1000 + 100)
  }
  reschedule()
})

let hoverTimer: ReturnType<typeof setTimeout> | undefined
watch(hoveredBook, (id) => {
  // A hovered Book's faces jump the queue.
  reschedule()
  clearTimeout(hoverTimer)
  if (!id) return
  hoverTimer = setTimeout(() => {
    if (hoveredBook.value !== id) return
    const url = fullCoverUrl(id)
    if (url) prefetchFullCover(url, loadPriority(id, 'shown'))
    prepareBack(id)
  }, HOVER_PREFETCH_MS)
})

watch(face, (value) => {
  if (!pickedId.value) return
  const motion = motionFor(pickedId.value)
  tween(motion.flip, value === 'back' ? Math.PI : 0, FLIP_SECONDS)
  // Flipping squares the Book up again, so front and back come round cleanly.
  gsap.to(motion.spin, { x: 0, y: 0, duration: reduced.value ? 0 : FLIP_SECONDS, ease: 'power2.inOut' })
})

// Drag to spin the picked Book.
let dragging = false
let lastX = 0
let lastY = 0

function onPointerDown(event: PointerEvent) {
  if (!pickedId.value) return
  dragging = true
  lastX = event.clientX
  lastY = event.clientY
}

function onPointerMove(event: PointerEvent) {
  pressMoved(event)
  // A release outside the window never reaches us: no button down, no drag.
  if (dragging && !(event.buttons & 1)) dragging = false
  if (!dragging || !pickedId.value) return
  const dx = event.clientX - lastX
  const dy = event.clientY - lastY
  lastX = event.clientX
  lastY = event.clientY
  const spin = motionFor(pickedId.value).spin
  spin.x += dx * SPIN_PER_PX
  spin.y = MathUtils.clamp(spin.y + dy * SPIN_PER_PX, -1.3, 1.3)
  setCursor('grabbing')
}

function onPointerUp() {
  dragging = false
  if (pickedId.value) setCursor('grab')
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && pickedId.value) putAway()
}

onMounted(() => {
  const element = renderer.domElement as HTMLElement
  element.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerdown', notePointer, { capture: true })
  window.addEventListener('pointermove', notePointer, { capture: true })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('keydown', onKey)
})

// --- Per-frame pose ------------------------------------------------------------

const basePosition = new Vector3()
const targetPosition = new Vector3()
const targetQuaternion = new Quaternion()
const pulledPosition = new Vector3()
const inspectPosition = new Vector3()
const forward = new Vector3()
const up = new Vector3()
const right = new Vector3()
const glintOffset = new Vector3()
const baseQuaternion = new Quaternion()
const inspectQuaternion = new Quaternion()
const partial = new Quaternion()
const tiltQuaternion = new Quaternion()
const euler = new Euler()
const lookDummy = new Object3D()
const X_AXIS = new Vector3(1, 0, 0)
const Y_AXIS = new Vector3(0, 1, 0)

const smooth = (t: number) => t * t * (3 - 2 * t)

const FULLY_THERE = { opacity: 1, scale: 1 }
/** Overshoot of a popping Book (easeOutBack); 1 grows it about 4 % past full size. */
const POP_BACK = 1

/**
 * How a Book looks while it appears or vanishes, from presence 0 (gone) to 1:
 * a new Book pops out of nothing, a leaving one shrinks away.
 */
function presenceLook(presence: number, leaving: boolean): { opacity: number, scale: number } {
  if (presence >= 1) return FULLY_THERE
  if (leaving) return { opacity: 1, scale: smooth(presence) }
  const u = presence - 1
  return { opacity: Math.min(1, presence * 4), scale: 1 + (POP_BACK + 1) * u * u * u + POP_BACK * u * u }
}

// --- Re-sort --------------------------------------------------------------------
// When the Stack is re-sorted or filtered, Books travel along a plan in which
// they never pass through each other (see utils/stack/shuffle.ts).

let running: { plan: ShufflePlan, startedAt: number, to: BookPose[] } | null = null
/** The last re-sort or entrance: how many Books moved, which style ran (dev choices) and when it ends (Stack separators). */
const lastShuffle = useState<{ moves: number, style: string, until?: number } | null>('shuffle:last', () => null)
/** A re-sort that arrived while another was running; starts when that one ends. */
let queued: BookPose[] | null = null
/** A re-sort waiting for the next frame, so it plans with the camera where it will be. */
let requested: { from: BookPose[], to: BookPose[] } | null = null
let shuffleTime = 0

const viewPoint = new Vector3()
/** Stays this far inside the picture's top and bottom edge. */
const VIEW_INSET = 0.04

/** Heights the camera shows at the pile's axis (z = 0), for where new Books appear. */
function viewBand(cam: PerspectiveCamera | undefined): ShuffleView | undefined {
  if (!cam) return undefined
  cam.updateMatrixWorld()
  const [bottom, top] = [-1, 1].map((ndcY) => {
    viewPoint.set(0, ndcY, 0.5).unproject(cam).sub(cam.position)
    if (Math.abs(viewPoint.z) < 1e-6) return Number.NaN
    return cam.position.y + viewPoint.y * (-cam.position.z / viewPoint.z)
  }) as [number, number]
  if (!Number.isFinite(bottom) || !Number.isFinite(top) || top - bottom < 3 * VIEW_INSET) return undefined
  return { bottom: bottom + VIEW_INSET, top: top - VIEW_INSET }
}

/**
 * A pile that appears from nothing (the Stack's first look) settles in from
 * the bottom up, like the second half of a swap (see planEnter). The plan is
 * made on the first frame, with the camera in place; until then a pending
 * `until` keeps the Stack's separators hidden.
 */
const PENDING = Number.POSITIVE_INFINITY

/**
 * Longest an entrance waits, unseen, for the faces of the Books in view (s),
 * so the pile settles in dressed; past it, it settles in with drawn faces.
 * A library file without small pile copies: its full-size faces rarely make
 * it in time, so it waits less.
 */
const ENTRANCE_WAIT = 0.8
const ENTRANCE_WAIT_FULL_SIZE = 0.3
/** The library file lists images but no pile copies of them. */
let fullSizeFaces = false
/** When the waiting entrance was asked for (performance.now()). */
let entranceAskedAt = 0

function requestEntrance(to: BookPose[]) {
  requested = { from: [], to }
  entranceAskedAt = performance.now()
  lastShuffle.value = { moves: to.length, style: 'enter', until: PENDING }
}

/** An entrance waits until the Books in view wear their faces, or ENTRANCE_WAIT. */
function entranceWaits(): boolean {
  if (!requested || requested.from.length > 0 || !stackScroll) return false
  if (performance.now() - entranceAskedAt >= (fullSizeFaces ? ENTRANCE_WAIT_FULL_SIZE : ENTRANCE_WAIT) * 1000) return false
  return requested.to.some(pose => inView(pose.y, stackScroll) && !materialsByBook.get(pose.bookId)?.ready)
}

/** No entrance after all: the separators may show. */
function dropPending() {
  if (lastShuffle.value?.until === PENDING) lastShuffle.value = null
}

function startShuffle(from: BookPose[], to: BookPose[]) {
  if (props.shuffle === 'instant' || reduced.value) {
    running = null
    extra.value = []
    dropPending()
    sweep()
    return
  }
  const moves = countMoves(from, to)
  const style = chooseShuffle(moves)
  const view = viewBand(camera.value as PerspectiveCamera | undefined)
  const plan = planShuffle(from, to, style, { view })
  lastShuffle.value = { moves, style: from.length ? style : 'enter', until: performance.now() + plan.duration * 1000 }
  running = plan.duration > 0 ? { plan, startedAt: performance.now(), to } : null
  // Leaving Books stay drawn until they have vanished.
  extra.value = running ? from.filter(pose => plan.leaving.has(pose.bookId)) : []
  sweep()
}

if (props.poses.length > 0 && props.shuffle === 'animate' && !reduced.value) requestEntrance(props.poses)

watch(() => props.poses, (next, previous) => {
  if (props.shuffle === 'instant' || reduced.value) {
    running = null
    queued = null
    requested = null
    extra.value = []
    dropPending()
    sweep()
    return
  }
  const staying = new Set(next.map(pose => pose.bookId))
  if (running) {
    // Books of the running plan keep moving (and are drawn) until it ends.
    queued = next
    const drawn = [...running.to, ...rendered.value.filter(pose => running!.plan.leaving.has(pose.bookId))]
    extra.value = drawn.filter(pose => !staying.has(pose.bookId))
    return
  }
  // Nothing was there (the Library arrived after the Stack): it settles in.
  if (!requested && !previous?.length) {
    requestEntrance(next)
    return
  }
  requested = { from: requested?.from ?? previous, to: next }
  extra.value = requested.from.filter(pose => !staying.has(pose.bookId))
})

/** Where the view was when the load queue last read its ranks. */
const ranked = { focusY: Number.NaN, targetY: Number.NaN }

onBeforeRender(({ delta }) => {
  // The load window moves with the scroll: new ranks once the view has moved a little.
  if (stackScroll && (Math.abs(stackScroll.focusY - ranked.focusY) > 0.03 || Math.abs(stackScroll.targetY - ranked.targetY) > 0.03)) {
    ranked.focusY = stackScroll.focusY
    ranked.targetY = stackScroll.targetY
    reschedule()
  }
  drawBackWhenDue()
  drawPending()
  const waiting = entranceWaits()
  if (requested && !waiting) {
    if (props.debugLoads && !requested.from.length) noteEntrance(requested.to)
    startShuffle(requested.from, requested.to)
    requested = null
  }
  shuffleTime = running ? (performance.now() - running.startedAt) / 1000 : 0
  if (running && shuffleTime >= running.plan.duration) {
    const from = running.to
    running = null
    if (queued) {
      startShuffle(from, queued)
      queued = null
      shuffleTime = 0
    }
    else {
      extra.value = []
      sweep()
    }
  }
  const cam = camera.value as PerspectiveCamera | undefined
  const ease = 1 - Math.exp(-(delta ?? 0.016) * 12)
  followInsets(reduced.value ? 1 : 1 - Math.exp(-(delta ?? 0.016) * 6))
  let glintBook: { mesh: Mesh, pose: BookPose, motion: Motion } | null = null
  // No scroll highlight while a Book is out or a re-sort runs; the mouse wins while it rests on a Book.
  const blocked = !!pickedId.value || !!running || !!requested
  highlight.update(props.poses, delta ?? 0.016, blocked, hoveredId)
  if (stackScroll) {
    const settled = settledGlint(glintSettle, {
      focusedId: focusedBook.value,
      speed: stackScroll.speed,
      gap: Math.abs(stackScroll.targetY - stackScroll.focusY),
      blocked,
    }, delta ?? 0.016, settleDelay())
    if (settled && !reduced.value) glint(settled)
  }
  // Once the user scrolls, the Book under a resting mouse gives way to the focus.
  const pointerId = scrollLed.value ? null : hoveredId

  for (const pose of rendered.value) {
    const mesh = meshes.get(pose.bookId)
    if (!mesh) continue
    const motion = motionFor(pose.bookId)
    const isPicked = pickedId.value === pose.bookId
    const hovered = pointerId === pose.bookId || (hoveredBook.value === pose.bookId && hoveredId !== pose.bookId)
    const hoverTarget = hovered && !isPicked && motion.pick.value === 0 ? 1 : 0
    motion.hover += (hoverTarget - motion.hover) * ease
    if (Math.abs(motion.hover - hoverTarget) < 0.001) motion.hover = hoverTarget

    targetPosition.set(pose.x, pose.y, pose.z)
    targetQuaternion.setFromEuler(euler.set(pose.rotation[0], pose.rotation[1], pose.rotation[2]))
    // A running re-sort moves the Book along its collision-free track; Books
    // entering or leaving the view appear or vanish on the way.
    const track = running?.plan.tracks.get(pose.bookId) ?? running?.plan.leaving.get(pose.bookId)
    let presence = 1
    if (track && running && shuffleTime < running.plan.duration) {
      const sample = sampleTrack(track, shuffleTime)
      targetPosition.set(...sample.position)
      targetQuaternion.setFromEuler(euler.set(...sample.rotation))
      presence = presenceAt(running.plan, pose.bookId, shuffleTime)
    }
    // New to a re-sort that waits for the running one, or to an entrance that waits: not there yet.
    else if (running || waiting) presence = 0
    const appearance = presenceLook(presence, !!running?.plan.vanish.has(pose.bookId))
    mesh.visible = presence > 0
    mesh.castShadow = appearance.opacity > 0.5
    mesh.scale.set(pose.thickness * appearance.scale, pose.height * appearance.scale, pose.depth * appearance.scale)
    const faces = materialsByBook.get(pose.bookId)
    if (faces) setOpacity(faces, appearance.opacity)
    const shown = motion.shown
    shown.position.copy(targetPosition)
    shown.quaternion.copy(targetQuaternion)
    shown.ready = true
    basePosition.copy(shown.position)
    baseQuaternion.copy(shown.quaternion)

    // Hover: towards the viewer, top tilting out a little.
    if (!reduced.value && motion.hover > 0) {
      basePosition.z += HOVER_OUT * motion.hover
      tiltQuaternion.setFromAxisAngle(X_AXIS, HOVER_TILT * motion.hover)
      baseQuaternion.premultiply(tiltQuaternion)
    }
    // Scroll highlight (riffle): a little pull-out and tilt, turned about its left end.
    const lift = highlight.liftOf(pose, isPicked || motion.pick.value > 0)
    if (lift.out > 0 || lift.yaw > 0) {
      basePosition.z += lift.out + pose.height / 2 * Math.sin(lift.yaw)
      basePosition.x += pose.height / 2 * (Math.cos(lift.yaw) - 1)
      baseQuaternion.premultiply(tiltQuaternion.setFromAxisAngle(Y_AXIS, -lift.yaw))
      baseQuaternion.premultiply(tiltQuaternion.setFromAxisAngle(X_AXIS, lift.tilt))
    }

    const pick = motion.pick.value
    if (pick <= 0 || !cam) {
      mesh.position.copy(basePosition)
      mesh.quaternion.copy(baseQuaternion)
    }
    else {
      pulledPosition.copy(basePosition)
      pulledPosition.z += PULL_OUT
      if (pick <= PULL_PHASE) {
        mesh.position.lerpVectors(basePosition, pulledPosition, smooth(pick / PULL_PHASE))
        mesh.quaternion.copy(baseQuaternion)
      }
      else {
        // In front of the camera, sized to fill part of the view, a little above centre;
        // left of centre on wide views (the details card, bottom right), above a
        // phone's details sheet (utils/books/inspect.ts).
        cam.getWorldDirection(forward)
        up.copy(cam.up).applyQuaternion(cam.quaternion)
        right.crossVectors(forward, up).normalize()
        const frame = inspectFrame({
          fov: MathUtils.degToRad(cam.fov ?? 38),
          aspect: cam.aspect ?? 1,
          height: pose.height,
          depth: pose.depth,
          top: inset.top,
          bottom: inset.bottom,
          aside: props.aside,
        })
        inspectPosition.copy(cam.position)
          .addScaledVector(forward, frame.distance)
          .addScaledVector(up, frame.up)
          .addScaledVector(right, frame.right)
        lookDummy.position.copy(inspectPosition)
        lookDummy.up.copy(up)
        lookDummy.lookAt(cam.position)
        // Face the camera with the front Cover (+x), then flip and spin.
        inspectQuaternion.copy(lookDummy.quaternion)
          .multiply(partial.setFromAxisAngle(X_AXIS, motion.spin.y))
          .multiply(partial.setFromAxisAngle(Y_AXIS, motion.spin.x + motion.flip.value - Math.PI / 2))
        const t = smooth((pick - PULL_PHASE) / (1 - PULL_PHASE))
        mesh.position.lerpVectors(pulledPosition, inspectPosition, t)
        mesh.quaternion.slerpQuaternions(baseQuaternion, inspectQuaternion, t)
      }
    }

    // Shine: a hovered, focused or picked Book catches the light.
    const shine = Math.max(motion.hover, lift.shine, pick * 0.6)
    const entry = materialsByBook.get(pose.bookId)
    if (entry) {
      applyShine(entry.spine, shine)
      applyShine(entry.cover, shine)
      applyShine(entry.back, shine)
    }

    const glinting = pointerId === pose.bookId || focusedBook.value === pose.bookId
    if (glinting && motion.glint.value < 1 && !isPicked) glintBook = { mesh, pose, motion }
  }

  // Glint: a small warm light sweeping down the hovered Book once.
  const light = glintLight.value
  if (light) {
    if (glintBook && !reduced.value) {
      const { mesh, pose, motion } = glintBook
      const g = motion.glint.value
      glintOffset.set(0, (0.5 - g) * pose.height * 1.1, 0).applyQuaternion(mesh.quaternion)
      light.position.copy(mesh.position).add(glintOffset)
      light.position.z += 0.09
      light.intensity = Math.sin(Math.PI * g) * 0.18
    }
    else {
      light.intensity = 0
    }
  }
})

onBeforeUnmount(() => {
  const element = renderer.domElement as HTMLElement | undefined
  element?.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerdown', notePointer, { capture: true })
  window.removeEventListener('pointermove', notePointer, { capture: true })
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('keydown', onKey)
  if (controls.value) (controls.value as { enabled: boolean }).enabled = true
  for (const motion of motionByBook.values()) gsap.killTweensOf([motion.pick, motion.flip, motion.spin, motion.glint])
  geometry.dispose()
  for (const entry of materialsByBook.values()) disposeEntry(entry)
  materialsByBook.clear()
  dropPending()
})
</script>

<template>
  <TresGroup
    ref="group"
    name="books"
  >
    <TresMesh
      v-for="pose in rendered"
      :key="pose.bookId"
      :ref="(element: unknown) => setMesh(pose.bookId, element)"
      :name="`book:${pose.bookId}`"
      :user-data="{ bookId: pose.bookId }"
      :geometry="geometry"
      :material="materialsFor(pose)"
      :scale="[pose.thickness, pose.height, pose.depth]"
      cast-shadow
      receive-shadow
      @pointerenter="onEnter"
      @pointerleave="onLeave"
    />
    <TresPointLight
      ref="glintLight"
      color="#FFE6C4"
      :intensity="0"
      :distance="0.45"
      :decay="2"
    />
  </TresGroup>
</template>
