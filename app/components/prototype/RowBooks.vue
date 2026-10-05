<script setup lang="ts">
// Design round (horizontal Stack): the Books of a prototype row. A trimmed
// fork of books/Meshes.vue (same materials, lazy faces, Pick, Inspect, drag
// to turn, backs drawn only for the picked Book) for a row along x:
// - the load window runs along x (RowView is a LoadView in x);
// - no re-sort animation, no scroll highlight; instead one of three focus
//   looks (props.focus): 'tilt' (the Book tips out at the top), 'riffle'
//   (a bell of Books fans out around the focus), 'flow' (the Book turns to
//   face you and the others make room);
// - its own Pick state (RowContext), so several rows can share a page.
// Productionising this means folding the axis and the focus looks into
// Meshes.vue instead of keeping a fork (COMPARE.md).
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
import { CLICK_SLOP, isClick, movePress, startPress } from '#layers/regal/app/utils/books/press'
import type { Press } from '#layers/regal/app/utils/books/press'
import { bookAt, toNdc } from '#layers/regal/app/utils/books/hit'
import { clickAt, flip, SHELVED } from '#layers/regal/app/utils/books/pick'
import { reschedule, setBands } from '#layers/regal/app/utils/covers/loadQueue'
import type { Priority } from '#layers/regal/app/utils/covers/loadQueue'
import { LOAD_BANDS, loadRank } from '#layers/regal/app/utils/covers/loadWindow'
import type { Boost, FaceUse } from '#layers/regal/app/utils/covers/loadWindow'
import { approach, focusLine, liftFor, RIFFLE as STACK_RIFFLE, targetAmount } from '#layers/regal/app/utils/stack/scrollHighlight'
import type { Lift } from '#layers/regal/app/utils/stack/scrollHighlight'
import { createGlintSettle, GLINT_DELAY, settledGlint } from '#layers/regal/app/utils/stack/glintSettle'
import type { LoadedCover } from '#layers/regal/app/utils/covers/coverTextures'
import { fromHex, readableOn } from '#layers/regal/app/utils/covers/palette'
import type { RGB } from '#layers/regal/app/utils/covers/palette'
import type { RowContext } from '#layers/regal/app/prototype/row/context'
import type { RowFocus, RowPile } from '#layers/regal/app/prototype/row/layout'

const props = defineProps<{
  poses: BookPose[]
  books: Book[]
  ctx: RowContext
  focus: RowFocus
  focusAt: 'centre' | 'pointer'
  /**
   * Which Books show their front in the row (all in the fan, a pile's top
   * one): those load it with the Spine; the others only once taken out.
   */
  frontShown: (bookId: string) => boolean
  /** Spine canvases at this share of their full resolution (a small card needs fewer pixels). */
  spineScale: number
  /** (b) The pile each Book lies in: the riffle runs through the pile under the focus. */
  piles?: Record<string, RowPile>
  /** Where the focus line ends up at either end of the scroll (world x). */
  ends: [number, number]
  /**
   * The horizontal Stack ('stack' focus): how hover and the scroll riffle
   * look. 'stack' is the vertical Stack's, turned 90° with the pile
   * (riffle: the Book swings its bottom out about its top end); 'tip' is
   * the Shelf's (the Book tips its top out about its bottom edge, as when
   * pulled out with a finger on its head: the riffle's default).
   */
  hoverLook?: 'stack' | 'tip'
  riffleLook?: 'stack' | 'tip'
}>()

const ctx = props.ctx
const hoveredBook = ctx.hovered
const { facesOf } = useLibrary()

// --- Look (as Meshes.vue) ------------------------------------------------------

const CLOTH_ALBEDO = 0.3
const COVER_ALBEDO = 0.55
const FACE_ALBEDO = 0.42
const PAPER_ALBEDO = 0.78
const HEAD_DUST = 0.9
const PAGE_BUMP = 0.5

interface Gloss { clearcoat: number, clearcoatRoughness: number, envMapIntensity: number }
const CLOTH_GLOSS: Gloss = { clearcoat: 0.12, clearcoatRoughness: 0.6, envMapIntensity: 0.35 }
const PRINTED_GLOSS: Gloss = { clearcoat: 0.15, clearcoatRoughness: 0.55, envMapIntensity: 0.35 }
const COVER_GLOSS: Gloss = { clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.35 }
const HOVER_GLOSS: Gloss = { clearcoat: 0.55, clearcoatRoughness: -0.3, envMapIntensity: 0.9 }

// --- Motion ----------------------------------------------------------------------

const PULL_OUT = 0.12
const PULL_PHASE = 0.3
const OUT_SECONDS = 1.0
const RETURN_SECONDS = 0.8
const FLIP_SECONDS = 0.7
const SPIN_PER_PX = 0.01

/** The vertical Stack's hover (Meshes.vue): towards you and a little turned. */
const STACK_HOVER = { out: 0.035, tilt: 0.045 }
/** Focus looks. Tilt: how far the Book tips out (rad) and comes forward. */
const TILT = { angle: 0.32, out: 0.012, lift: 0.004, rate: 10 }
/** Riffle (the Stack's, utils/stack/scrollHighlight.ts): Books within this height of the pile's focus fan out. */
const RIFFLE = { radius: 0.035, rate: STACK_RIFFLE.rate }
/** Flow: the focused Book turns to face you; the others part by `part` (m) within `radius`. */
const FLOW = { radius: 0.07, part: 0.06, out: 0.06, lift: 0.006, rate: 8 }

const geometry = new BoxGeometry(1, 1, 1)

interface BookMaterials {
  faces: Material[]
  cover: MeshPhysicalMaterial
  back: MeshPhysicalMaterial
  spine: MeshPhysicalMaterial
  spineTexture: CanvasTexture
  backTexture: CanvasTexture
  edges: {
    plan: PageEdgePlan
    canvas: HTMLCanvasElement
    textures: CanvasTexture[]
    materials: [MeshStandardMaterial, MeshStandardMaterial, MeshStandardMaterial]
  }
  set: AssetFaces | null
  art: { spine?: Picture, back?: Picture }
  description?: string | null
  loaded: LoadedCover | null
  ready: boolean
  fullCover: string | null
  backPrep: BackPrep | null
  aborted: AbortController
}

interface Motion {
  hover: number
  focus: number
  pick: { value: number }
  flip: { value: number }
  spin: { x: number, y: number }
  glint: { value: number }
  /**
   * Where a Book put back starts its way home, relative to the camera: it
   * leaves from where it was shown, wherever the details, the insets or the
   * camera go meanwhile (no snap to a recomputed inspect place).
   */
  returnFrom: { position: Vector3, quaternion: Quaternion } | null
}

const materialsByBook = new Map<string, BookMaterials>()
const motionByBook = new Map<string, Motion>()
const meshes = new Map<string, Mesh>()

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
  const material = new MeshPhysicalMaterial({ map: texture, color: new Color(1, 1, 1).multiplyScalar(FACE_ALBEDO), roughness: 0.68, metalness: 0 })
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
    palette: set?.palette ?? entry?.loaded?.palette ?? { background, text, accent: text },
    cover: entry?.loaded?.image,
    seed: hashString(book.id),
    description: entry?.description ?? null,
    spineArt: entry?.art.spine,
    backArt: entry?.art.back,
    quotes: set?.entry.quotes,
    genre: set?.entry.genre,
    publisher: set?.entry.publisher,
    backIsPhoto: isPhotoFace(set?.entry, 'back'),
    spineIsPhoto: isPhotoFace(set?.entry, 'spine'),
  }
}

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
    const spineTexture = faceTexture(input ? spineCanvas(input) : document.createElement('canvas'))
    const backTexture = faceTexture(plainBack(pose))
    const spine = printed(spineTexture)
    const back = printed(backTexture)
    const edges = pageEdgesFor(pose, fromHex(pose.color))
    const [head, tail, fore] = edges.materials
    entry = { cover, back, spine, spineTexture, backTexture, edges, set: null, art: {}, loaded: null, ready: false, fullCover: null, backPrep: null, aborted: new AbortController(), faces: [cover, back, head, tail, spine, fore] }
    materialsByBook.set(pose.bookId, entry)
  }
  return entry.faces
}

function motionFor(bookId: string): Motion {
  let motion = motionByBook.get(bookId)
  if (!motion) {
    motion = { hover: 0, focus: 0, pick: { value: 0 }, flip: { value: 0 }, spin: { x: 0, y: 0 }, glint: { value: 1 }, returnFrom: null }
    motionByBook.set(bookId, motion)
  }
  return motion
}

const ART_HEIGHT = 1024

/** Dresses a Book as its faces arrive, most visible first (as Meshes.vue). */
async function applyCover(pose: BookPose) {
  const book = booksById.value.get(pose.bookId)
  if (!book) return
  const set = facesOf(book.id)
  await Promise.resolve()
  const entry = materialsByBook.get(pose.bookId)
  if (!entry || entry.aborted.signal.aborted) return
  entry.set = set

  const fonts = spineFontsReady()
  const frontShows = () => props.frontShown(pose.bookId) || !set?.palette
  const shown = loadPriority(pose.bookId, 'shown')
  const frontPriority = loadPriority(pose.bookId, () => (frontShows() ? 'shown' : 'hidden'))
  // A front the row never shows waits for the Pick (setFullCover), saving its memory.
  const front = !frontShows()
    ? Promise.resolve(null)
    : (set?.pileFront ? loadCover(set.pileFront, frontPriority) : Promise.resolve(null))
        .then(loaded => loaded ?? (set?.front && set.front !== set.pileFront ? loadCover(set.front, frontPriority) : null))
  const signal = entry.aborted.signal
  const spineArt = set?.spine ? loadPicture(set.spine, shown, set.entry.pile?.spine ? undefined : ART_HEIGHT, signal) : null
  const draw = (paint: (entry: BookMaterials) => void) => whenDrawn(entry, pose.bookId, paint)

  if (set?.palette || set?.spineColor) {
    await fonts
    await draw((entry) => {
      redrawPageEdges(entry, set.spineColor ?? set.palette!.background, pose.bookId)
      if (spineArt) return
      drawFace(pose, entry, 'spine')
      entry.ready = !frontShows()
    })
  }

  if (spineArt) {
    const [art] = await Promise.all([spineArt, fonts, set?.palette ? null : front])
    const drawn = await draw((entry) => {
      if (art) entry.art.spine = art
      if (!set?.spineColor && art) redrawPageEdges(entry, averageColor(art), pose.bookId)
      drawFace(pose, entry, 'spine')
      entry.ready = !frontShows()
    })
    if (!drawn) return closePicture(art)
  }

  const [loaded] = await Promise.all([front, fonts])
  await draw((entry) => {
    entry.loaded = loaded
    if (loaded && !entry.fullCover) printCover(entry, loaded.texture)
    if (!set?.palette && !spineArt) {
      redrawPageEdges(entry, loaded?.palette.background ?? fromHex(pose.color), pose.bookId)
      drawFace(pose, entry, 'spine')
    }
    entry.ready = true
  })
}

function closePicture(picture: Picture | null | undefined) {
  if (picture && 'close' in picture && typeof picture.close === 'function') picture.close()
}

function drawFace(pose: BookPose, entry: BookMaterials, face: 'spine' | 'back') {
  const input = faceInput(pose, entry)
  if (input) setFace(entry, face, face === 'spine' ? spineCanvas(input) : drawBack(input))
}

/** The Spine drawn as in the Stack, then scaled down to what the row shows (LOD). */
function spineCanvas(input: FaceInput): HTMLCanvasElement {
  const full = drawSpine(input)
  const scale = props.spineScale
  if (scale >= 0.99) return full
  const small = document.createElement('canvas')
  small.width = Math.max(8, Math.round(full.width * scale))
  small.height = Math.max(8, Math.round(full.height * scale))
  const context = small.getContext('2d')!
  context.imageSmoothingQuality = 'high'
  context.drawImage(full, 0, 0, small.width, small.height)
  full.width = 0
  return small
}

function disposeEntry(entry: BookMaterials) {
  entry.cover.dispose()
  entry.back.dispose()
  entry.spine.dispose()
  entry.spineTexture.dispose()
  entry.backTexture.dispose()
  for (const texture of entry.edges.textures) texture.dispose()
  for (const material of entry.edges.materials) material.dispose()
  entry.aborted.abort()
  closePicture(entry.art.spine)
  closePicture(entry.art.back)
  closePicture(entry.backPrep?.picture)
  if (entry.fullCover) releaseFullCover(entry.fullCover)
}

// Load order: the load window along x (utils/covers/loadWindow.ts is axis-agnostic).
const view = ctx.view
setBands(LOAD_BANDS)
const poseX = new Map<string, number>()

function boostOf(bookId: string): Boost {
  if (ctx.pick.value.bookId === bookId) return 'picked'
  return hoveredBook.value === bookId ? 'hovered' : null
}

function loadPriority(bookId: string, use: FaceUse | (() => FaceUse)): Priority {
  return () => loadRank(poseX.get(bookId), view, typeof use === 'function' ? use() : use, boostOf(bookId))
}

const DRAW_BUDGET_MS = 6
const drawQueue: { bookId: string, run: () => void }[] = []

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
  const ranks = new Map<string, number>()
  for (const item of drawQueue) {
    if (!ranks.has(item.bookId)) ranks.set(item.bookId, loadRank(poseX.get(item.bookId), view, 'shown', boostOf(item.bookId)))
  }
  drawQueue.sort((a, b) => ranks.get(a.bookId)! - ranks.get(b.bookId)!)
  while (drawQueue.length && performance.now() - started < DRAW_BUDGET_MS) drawQueue.shift()!.run()
}

watch(() => props.poses, (poses) => {
  const keep = new Set(poses.map(pose => pose.bookId))
  for (const [bookId, entry] of materialsByBook) {
    if (keep.has(bookId)) continue
    disposeEntry(entry)
    materialsByBook.delete(bookId)
    motionByBook.delete(bookId)
    poseX.delete(bookId)
  }
  for (const pose of poses) {
    poseX.set(pose.bookId, pose.x)
    if (!materialsByBook.has(pose.bookId)) {
      materialsFor(pose)
      applyCover(pose)
    }
  }
  if (ctx.pick.value.bookId && !keep.has(ctx.pick.value.bookId)) ctx.pick.value = SHELVED
}, { immediate: true })

// --- Interaction -------------------------------------------------------------------

const { camera, renderer, sizes } = useTres()
const { onBeforeRender } = useLoop()
const pickedId = computed(() => ctx.pick.value.bookId)
const face = computed(() => ctx.pick.value.face)
const reducedMotion = usePreferredReducedMotion()
const reduced = computed(() => reducedMotion.value === 'reduce')

const glintLight = shallowRef<PointLight | null>(null)
const group = shallowRef<Group | null>(null)
let hoveredId: string | null = null
const glintSettle = createGlintSettle()
/** How faded the row is behind a picked Book (0..1): a paper veil in RowScene. */
const dim = ctx.dim
/**
 * Inspect: the picked Book comes towards the camera until it shows this much
 * larger than it stood in the row, like in the Stack (never smaller), or
 * fills this share of the free band in a full viewport; never more than
 * the band allows.
 */
const INSPECT_GROW = 1.12
const INSPECT_VIEWPORT_FILL = 0.5
const INSPECT_MAX_FILL = 0.9
const rayPoint = new Vector3()
const ndcPoint = new Vector3()

/**
 * Where the picked Book floats: on the ray through the middle of the band the
 * card's (or the viewport's) details leave free, at the distance that gives
 * it its size. Works with the camera's view offset (a broken-out card renders
 * the whole viewport, its camera still aimed at the card).
 */
function inspectTarget(cam: PerspectiveCamera, pose: BookPose, into: Vector3): Vector3 {
  const width = sizes.width.value || 1
  const height = sizes.height.value || 1
  // Focal length in CSS px of what the canvas shows (the same in and out of the card).
  const focal = cam.projectionMatrix.elements[5]! * height / 2
  const band = {
    top: ctx.insets.top * height,
    bottom: height - ctx.insets.bottom * height,
    left: 0,
    right: width - ctx.insets.right * width,
  }
  const bandHeight = Math.max(40, band.bottom - band.top)
  const bandWidth = Math.max(40, band.right - band.left)
  const rowPx = pose.height * focal / view.distance
  const wanted = ctx.inspectFull.value ? Math.max(rowPx * INSPECT_GROW, INSPECT_VIEWPORT_FILL * bandHeight) : rowPx * INSPECT_GROW
  const px = Math.min(wanted, INSPECT_MAX_FILL * bandHeight, 0.8 * bandWidth * pose.height / pose.depth)
  const distance = pose.height * focal / px
  ndcPoint.set(((band.left + band.right) / 2) / width * 2 - 1, 1 - ((band.top + band.bottom) / 2) / height * 2, 0.5)
  rayPoint.copy(ndcPoint).unproject(cam).sub(cam.position).normalize()
  return into.copy(cam.position).addScaledVector(rayPoint, distance)
}

function putAway() {
  ctx.pick.value = SHELVED
}

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

type BookPointerEvent = { object?: { userData?: { bookId?: string } } }
let pointerType = 'mouse'
function notePointer(event: PointerEvent) {
  pointerType = event.pointerType
}

function onEnter(event: BookPointerEvent) {
  const bookId = event.object?.userData?.bookId
  if (!bookId || pointerType === 'touch') return
  hoveredId = bookId
  hoveredBook.value = bookId
  setCursor('pointer')
  if (reduced.value || pickedId.value === bookId) return
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

/** Remembers where a Book is shown, relative to the camera, for its way back. */
function holdForReturn(bookId: string, motion: Motion) {
  const mesh = meshes.get(bookId)
  const cam = camera.value as PerspectiveCamera | undefined
  if (!mesh || !cam || motion.pick.value <= 0) return
  cam.updateMatrixWorld()
  const position = cam.worldToLocal(mesh.position.clone())
  const quaternion = cam.getWorldQuaternion(new Quaternion()).invert().multiply(mesh.quaternion)
  motion.returnFrom = { position, quaternion }
}

watch(pickedId, (id, previous) => {
  if (previous) {
    const motion = motionFor(previous)
    holdForReturn(previous, motion)
    tween(motion.pick, 0, RETURN_SECONDS)
    tween(motion.flip, 0, RETURN_SECONDS)
    gsap.to(motion.spin, { x: 0, y: 0, duration: reduced.value ? 0 : RETURN_SECONDS, ease: 'power2.inOut' })
  }
  tween(dim, id ? 1 : 0, id ? OUT_SECONDS * 0.6 : RETURN_SECONDS)
  if (id) {
    const motion = motionFor(id)
    motion.returnFrom = null
    motion.spin.x = 0
    motion.spin.y = 0
    motion.flip.value = 0
    tween(motion.pick, 1, OUT_SECONDS)
  }
  setCursor(id ? 'grab' : 'default')
})

const HOVER_PREFETCH_MS = 200

function fullCoverUrl(bookId: string): string | null {
  return materialsByBook.get(bookId)?.set?.front ?? null
}

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
  if (entry.loaded) printCover(entry, entry.loaded.texture)
  else clothCover(entry)
  releaseFullCover(url)
}

function clothCover(entry: BookMaterials) {
  const plain = cloth(entry.cover.userData.cloth as string)
  entry.cover.map = null
  entry.cover.color.copy(plain.color)
  entry.cover.roughness = plain.roughness
  setGloss(entry.cover, CLOTH_GLOSS)
  entry.cover.needsUpdate = true
  plain.dispose()
}

// Backs: only the picked Book's is drawn, and given up again once it is back (as in the Stack).
interface BackPrep {
  bytes: Promise<Blob | null>
  picture: Picture | null | undefined
  decoding: boolean
  queued: boolean
  drawn: boolean
  aborted: AbortController
}

function prepareBack(bookId: string): BackPrep | null {
  const entry = materialsByBook.get(bookId)
  if (!entry) return null
  if (entry.backPrep) return entry.backPrep
  for (const [id, other] of materialsByBook) {
    if (id !== bookId && id !== pickedId.value && other.backPrep && !other.backPrep.queued) releaseBack(id)
  }
  const aborted = new AbortController()
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

function drawBackWhenDue() {
  const bookId = pickedId.value
  if (!bookId) return
  const entry = materialsByBook.get(bookId)
  const prep = prepareBack(bookId)
  if (!entry || !prep) return
  decodeBack(entry, prep)
  const due = backDrawDue({ pick: motionFor(bookId).pick.value, face: face.value, artReady: prep.picture !== undefined, queued: prep.queued })
  const pose = due ? props.poses.find(candidate => candidate.bookId === bookId) : undefined
  if (!pose) return
  prep.queued = true
  void whenDrawn(entry, bookId, (current) => {
    if (current.backPrep !== prep) return
    if (prep.picture) current.art.back = prep.picture
    current.description = booksById.value.get(bookId)?.description?.trim() || null
    drawFace(pose, current, 'back')
    closePicture(current.art.back)
    current.art.back = undefined
    prep.picture = null
    prep.drawn = true
  })
}

function releaseBack(bookId: string) {
  const entry = materialsByBook.get(bookId)
  const prep = entry?.backPrep
  if (!entry || !prep) return
  entry.backPrep = null
  prep.aborted.abort()
  closePicture(prep.picture)
  const pose = props.poses.find(candidate => candidate.bookId === bookId)
  if (!prep.drawn || !pose) return
  const drawn = entry.backTexture.image as HTMLCanvasElement
  setFace(entry, 'back', plainBack(pose))
  drawn.width = 0
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
  gsap.to(motion.spin, { x: 0, y: 0, duration: reduced.value ? 0 : FLIP_SECONDS, ease: 'power2.inOut' })
})

// Clicks (as useBookClicks, with this row's own Pick): raycast when the press
// goes down, count it when it ends where it began. A finger that scrolls the
// row is cancelled by the browser (pointercancel), so it never clicks.
let press: Press | null = null
let aimed: string | null = null
let pressed: { bookId: string, x: number, y: number } | null = null

// Drag to turn the picked Book (horizontal only on touch: vertical scrolls the
// page); a flick (a quick sideways drag let go) turns it over.
let dragging = false
let lastX = 0
let lastY = 0
let dragSpeed = 0
let lastMoveAt = 0
/** Px per ms a sideways release must reach to count as a flick. */
const FLICK_SPEED = 0.9

function canvas() {
  return renderer.domElement as HTMLCanvasElement | undefined
}

function onDown(event: PointerEvent) {
  const element = canvas()
  const point = element && event.button === 0 && event.isPrimary ? toNdc(element, event.clientX, event.clientY) : null
  press = point ? startPress(event) : null
  aimed = point ? bookAt(group.value, camera.value, point) : null
  // A finger is wider than a thin Spine: a tap that misses looks a little to either side.
  if (point && !aimed && event.pointerType !== 'mouse' && element) {
    const width = element.getBoundingClientRect().width
    const [x, y] = [point.x, point.y]
    for (const px of [6, -6, 12, -12, 18, -18]) {
      aimed = bookAt(group.value, camera.value, point.set(x + 2 * px / width, y))
      if (aimed) break
    }
    point.set(x, y)
  }
  pressed = null
  if (aimed && pickedId.value !== aimed) {
    prepareBack(aimed)
    pressed = { bookId: aimed, x: event.clientX, y: event.clientY }
  }
  if (pickedId.value) {
    dragging = true
    lastX = event.clientX
    lastY = event.clientY
    dragSpeed = 0
    lastMoveAt = event.timeStamp
  }
}

function onMove(event: PointerEvent) {
  if (press) press = movePress(press, event)
  if (pressed && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > CLICK_SLOP) {
    const { bookId } = pressed
    pressed = null
    if (pickedId.value !== bookId && hoveredBook.value !== bookId) releaseBack(bookId)
  }
  if (dragging && !(event.buttons & 1)) dragging = false
  if (!dragging || !pickedId.value) return
  const dx = event.clientX - lastX
  const dy = event.clientY - lastY
  const dt = Math.max(1, event.timeStamp - lastMoveAt)
  dragSpeed = dragSpeed * 0.5 + (dx / dt) * 0.5
  lastMoveAt = event.timeStamp
  lastX = event.clientX
  lastY = event.clientY
  const spin = motionFor(pickedId.value).spin
  spin.x += dx * SPIN_PER_PX
  if (event.pointerType === 'mouse') spin.y = MathUtils.clamp(spin.y + dy * SPIN_PER_PX, -1.3, 1.3)
  setCursor('grabbing')
}

function onUp(event: PointerEvent) {
  const flicked = dragging && Math.abs(dragSpeed) > FLICK_SPEED && event.timeStamp - lastMoveAt < 80
  dragging = false
  if (pickedId.value) setCursor('grab')
  if (flicked && pickedId.value) {
    ctx.pick.value = flip(ctx.pick.value)
    press = null
    return
  }
  const ended = press
  press = null
  const element = canvas()
  if (!element || event.target !== element || !isClick(ended, event)) return
  ctx.pick.value = clickAt(ctx.pick.value, aimed, 'put-back')
}

function onCancel() {
  press = null
  dragging = false
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && pickedId.value) putAway()
}

onMounted(() => {
  canvas()?.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('pointerdown', notePointer, { capture: true })
  window.addEventListener('pointermove', notePointer, { capture: true })
  window.addEventListener('keydown', onKey)
})

// --- Per frame ------------------------------------------------------------------------

const basePosition = new Vector3()
const targetQuaternion = new Quaternion()
const pulledPosition = new Vector3()
const inspectPosition = new Vector3()
const up = new Vector3()
const glintOffset = new Vector3()
const baseQuaternion = new Quaternion()
const inspectQuaternion = new Quaternion()
const partial = new Quaternion()
const tiltQuaternion = new Quaternion()
const pivot = new Vector3()
const euler = new Euler()
const lookDummy = new Object3D()
const lookAhead = new Vector3()
const X_AXIS = new Vector3(1, 0, 0)
const Y_AXIS = new Vector3(0, 1, 0)

const riffleLift: Lift = { out: 0, tilt: 0, yaw: 0, shine: 0 }
const smooth = (t: number) => t * t * (3 - 2 * t)
const bell = (distance: number, radius: number) => {
  const t = Math.min(1, Math.abs(distance) / radius)
  return 1 - smooth(t)
}

/** The flow's focus, eased (it follows the pointer, so it must not jump). */
let flowX = Number.NaN
/** Hysteresis for the nearest Book to the focus line. */
let focusIndex = -1

function focusTarget(): number {
  // A resting mouse or a finger (pointer variants), else the middle of the view;
  // near either end the line slides on to the end Book (as in the Stack).
  if (props.focusAt === 'pointer' && view.pointerX !== null) return view.pointerX
  return focusLine(view.cameraX, view.bounds, props.ends)
}

function nearestIndex(x: number): number {
  let best = -1
  let bestDistance = Infinity
  for (let index = 0; index < props.poses.length; index++) {
    const distance = Math.abs(props.poses[index]!.x - x)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  }
  const current = props.poses[focusIndex]
  if (current && Math.abs(current.x - x) - bestDistance < 0.004) return focusIndex
  return best
}

onBeforeRender(({ delta }) => {
  const seconds = delta ?? 0.016
  drawBackWhenDue()
  drawPending()
  const cam = camera.value as PerspectiveCamera | undefined
  const ease = 1 - Math.exp(-seconds * 12)
  const blocked = !!pickedId.value
  const stackMode = props.focus === 'stack'
  // A resting mouse leads over the scroll focus (until it leaves the Book).
  const hoverPose = hoveredId ? props.poses.find(pose => pose.bookId === hoveredId) : undefined
  // The horizontal Stack, as the vertical one (useScrollHighlight): the riffle
  // runs while the scroll leads; a resting mouse takes over with hover.
  const pointerId = stackMode && view.scrollLed ? null : hoveredId
  const riffleOn = stackMode && !blocked && !(hoveredId && !view.scrollLed)
  const target = hoverPose && props.focusAt === 'centre' && !stackMode ? hoverPose.x : focusTarget()
  if (Number.isNaN(flowX) || reduced.value) flowX = target
  else flowX += (target - flowX) * (1 - Math.exp(-seconds * FLOW.rate))
  focusIndex = blocked ? -1 : nearestIndex(props.focus === 'flow' ? flowX : target)
  // The riffle runs through the pile under the focus line, top to bottom as it crosses it.
  let pile: RowPile | null = null
  let pileY = 0
  if (props.focus === 'riffle' && props.piles && !blocked) {
    let best = Infinity
    for (const pose of props.poses) {
      const candidate = props.piles[pose.bookId]!
      const distance = Math.max(0, candidate.left - target, target - candidate.right)
      if (distance < best) {
        best = distance
        pile = candidate
      }
    }
    if (pile) {
      const across = MathUtils.clamp((target - pile.left) / (pile.right - pile.left), 0, 1)
      pileY = pile.top * (1 - across)
      let nearest = Infinity
      for (let index = 0; index < props.poses.length; index++) {
        const pose = props.poses[index]!
        if (props.piles[pose.bookId] !== pile) continue
        const distance = Math.abs(pose.y - pileY)
        if (distance < nearest) {
          nearest = distance
          focusIndex = index
        }
      }
    }
  }
  if (stackMode && !riffleOn) focusIndex = -1
  const focusId = focusIndex >= 0 ? props.poses[focusIndex]!.bookId : null
  // The label shows the Book in focus, or the one under the mouse.
  const labelled = stackMode ? (riffleOn ? focusId : (blocked ? null : pointerId)) : focusId
  if (ctx.focused.value !== labelled && !blocked) ctx.focused.value = labelled
  const settled = settledGlint(glintSettle, { focusedId: focusId, speed: view.speed, gap: 0, blocked }, seconds, GLINT_DELAY)
  if (settled && !reduced.value && !hoverPose) glint(settled)

  let glintBook: { mesh: Mesh, pose: BookPose, motion: Motion } | null = null
  for (const pose of props.poses) {
    const mesh = meshes.get(pose.bookId)
    if (!mesh) continue
    const motion = motionFor(pose.bookId)
    const isPicked = pickedId.value === pose.bookId
    const frozen = isPicked || motion.pick.value > 0

    // Focus amount, eased: one Book (tilt), a bell (riffle) or a continuous turn (flow).
    let focusAim = 0
    if (!blocked && !frozen) {
      if (props.focus === 'tilt') focusAim = pose.bookId === focusId ? 1 : 0
      else if (props.focus === 'riffle') focusAim = pile && props.piles?.[pose.bookId] === pile ? bell(pose.y - pileY, RIFFLE.radius) : 0
      else if (stackMode && riffleOn) focusAim = targetAmount(pose.x - target)
    }
    const rate = props.focus === 'tilt' ? TILT.rate : RIFFLE.rate
    if (props.focus !== 'flow') motion.focus = reduced.value ? focusAim : approach(motion.focus, focusAim, rate, seconds)

    basePosition.set(pose.x, pose.y, pose.z)
    targetQuaternion.setFromEuler(euler.set(pose.rotation[0], pose.rotation[1], pose.rotation[2]))
    baseQuaternion.copy(targetQuaternion)
    let shine = motion.focus
    const still = reduced.value

    if (props.focus === 'tilt' && motion.focus > 0 && !still) {
      // Tips out at the top about its bottom front edge, as when hooked with a finger.
      const a = motion.focus
      pivot.set(pose.x, 0, pose.z + pose.depth / 2)
      tiltQuaternion.setFromAxisAngle(X_AXIS, TILT.angle * a)
      basePosition.sub(pivot).applyQuaternion(tiltQuaternion).add(pivot)
      basePosition.z += TILT.out * a
      basePosition.y += TILT.lift * a
      baseQuaternion.premultiply(tiltQuaternion)
    }
    else if (props.focus === 'riffle' && motion.focus > 0) {
      // The Stack's riffle (Meshes.vue): a little out and tilted, turned about its left end.
      const lift = liftFor(motion.focus, still, riffleLift)
      basePosition.z += lift.out + pose.height / 2 * Math.sin(lift.yaw)
      basePosition.x += pose.height / 2 * (Math.cos(lift.yaw) - 1)
      baseQuaternion.premultiply(tiltQuaternion.setFromAxisAngle(Y_AXIS, -lift.yaw))
      baseQuaternion.premultiply(tiltQuaternion.setFromAxisAngle(X_AXIS, lift.tilt))
    }
    else if (stackMode && motion.focus > 0) {
      // The Stack's riffle turned 90° with the pile: Books passing the middle
      // fan out like pages flipped through, turned about their top end so the
      // bottom swings out (as the Stack turns them about their left end).
      // 'tip': about the bottom edge instead, the top swinging out.
      // 'tip' (the default): pulled out with a finger on its head: the top
      // tips towards you about the bottom front edge, the bottom stays put.
      const lift = liftFor(motion.focus, still, riffleLift)
      if (props.riffleLook === 'tip') {
        pivot.set(basePosition.x, 0, pose.z + pose.depth / 2)
        tiltQuaternion.setFromAxisAngle(X_AXIS, lift.yaw)
        basePosition.sub(pivot).applyQuaternion(tiltQuaternion).add(pivot)
        baseQuaternion.premultiply(tiltQuaternion)
      }
      else {
        const swing = pose.height / 2
        basePosition.z += lift.out + swing * Math.sin(lift.yaw)
        basePosition.y += swing * (1 - Math.cos(lift.yaw))
        baseQuaternion.premultiply(tiltQuaternion.setFromAxisAngle(X_AXIS, -lift.yaw))
        baseQuaternion.premultiply(tiltQuaternion.setFromAxisAngle(Y_AXIS, -lift.tilt))
      }
    }
    else if (props.focus === 'flow') {
      // Turns to face you near the focus; the others part to make room.
      const d = pose.x - flowX
      const f = blocked || frozen ? 0 : bell(d, FLOW.radius)
      motion.focus = f
      shine = f
      if (!still) {
        const part = blocked ? 0 : Math.sign(d) * FLOW.part * smooth(Math.min(1, Math.abs(d) / FLOW.radius))
        basePosition.x += part
        basePosition.z += FLOW.out * f
        basePosition.y += FLOW.lift * f
        const yaw = MathUtils.lerp(pose.rotation[1], -Math.PI / 2, smooth(f))
        baseQuaternion.setFromEuler(euler.set(pose.rotation[0], yaw, pose.rotation[2]))
      }
    }

    // Hover on the riffle/flow rows is the focus itself; on any row a hovered Book shines.
    const hovered = (stackMode ? pointerId : hoveredId) === pose.bookId && !frozen ? 1 : 0
    motion.hover += (hovered - motion.hover) * ease
    if (Math.abs(motion.hover - hovered) < 0.001) motion.hover = hovered
    shine = Math.max(shine, motion.hover)
    if (stackMode && motion.hover > 0 && !still) {
      if (props.hoverLook === 'tip') {
        // Tips out at the top about its bottom front edge.
        const a = motion.hover
        pivot.set(basePosition.x, 0, pose.z + pose.depth / 2)
        tiltQuaternion.setFromAxisAngle(X_AXIS, TILT.angle * a)
        basePosition.sub(pivot).applyQuaternion(tiltQuaternion).add(pivot)
        basePosition.z += TILT.out * a
        baseQuaternion.premultiply(tiltQuaternion)
      }
      else {
        // The Stack's hover turned with the pile: towards you, a little turned.
        basePosition.z += STACK_HOVER.out * motion.hover
        baseQuaternion.premultiply(tiltQuaternion.setFromAxisAngle(Y_AXIS, -STACK_HOVER.tilt * motion.hover))
      }
    }

    const pick = motion.pick.value
    // On its way out, in or back, the picked Book is drawn over a broken-out viewport too (RowScene).
    if (pick > 0) mesh.layers.enable(1)
    else mesh.layers.disable(1)
    if (pick <= 0) motion.returnFrom = null
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
      else if (motion.returnFrom && !isPicked) {
        // On its way back: from where it was shown (held relative to the camera) to the row.
        cam.updateMatrixWorld()
        inspectPosition.copy(motion.returnFrom.position).applyMatrix4(cam.matrixWorld)
        cam.getWorldQuaternion(inspectQuaternion).multiply(motion.returnFrom.quaternion)
        const t = smooth((pick - PULL_PHASE) / (1 - PULL_PHASE))
        mesh.position.lerpVectors(pulledPosition, inspectPosition, t)
        mesh.quaternion.slerpQuaternions(baseQuaternion, inspectQuaternion, t)
      }
      else {
        up.copy(cam.up).applyQuaternion(cam.quaternion)
        inspectTarget(cam, pose, inspectPosition)
        // Parallel to the picture, not turned to the camera: off the camera's
        // axis (a broken-out card) it would show keystoned.
        cam.getWorldDirection(lookAhead)
        lookDummy.position.copy(inspectPosition)
        lookDummy.up.copy(up)
        lookDummy.lookAt(lookAhead.multiplyScalar(-1).add(inspectPosition))
        inspectQuaternion.copy(lookDummy.quaternion)
          .multiply(partial.setFromAxisAngle(X_AXIS, motion.spin.y))
          .multiply(partial.setFromAxisAngle(Y_AXIS, motion.spin.x + motion.flip.value - Math.PI / 2))
        const t = smooth((pick - PULL_PHASE) / (1 - PULL_PHASE))
        mesh.position.lerpVectors(pulledPosition, inspectPosition, t)
        mesh.quaternion.slerpQuaternions(baseQuaternion, inspectQuaternion, t)
      }
    }

    shine = Math.max(shine, pick * 0.6)
    const entry = materialsByBook.get(pose.bookId)
    if (entry) {
      applyShine(entry.spine, shine)
      applyShine(entry.cover, shine)
      applyShine(entry.back, shine)
    }
    if ((hoveredId === pose.bookId || focusId === pose.bookId) && motion.glint.value < 1 && !isPicked) glintBook = { mesh, pose, motion }
  }

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
  canvas()?.removeEventListener('pointerdown', onDown)
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onCancel)
  window.removeEventListener('pointerdown', notePointer, { capture: true })
  window.removeEventListener('pointermove', notePointer, { capture: true })
  window.removeEventListener('keydown', onKey)
  for (const motion of motionByBook.values()) gsap.killTweensOf([motion.pick, motion.flip, motion.spin, motion.glint])
  gsap.killTweensOf(dim)
  geometry.dispose()
  for (const entry of materialsByBook.values()) disposeEntry(entry)
  materialsByBook.clear()
})
</script>

<template>
  <TresGroup
    ref="group"
    name="books"
  >
    <TresMesh
      v-for="pose in poses"
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
