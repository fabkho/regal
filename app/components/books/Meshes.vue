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
import type { Material, Mesh, PerspectiveCamera, PointLight } from 'three'
import { useLoop, useTres } from '@tresjs/core'
import gsap from 'gsap'
import type { Book } from '~~/shared/types/book'
import { hashString } from '~/utils/bookcase/layout'
import type { BookPose } from '~/utils/books/pose'
import { justDragged, markDragEnd } from '~/utils/books/dragGuard'
import { planShuffle, presenceAt, sampleTrack } from '~/utils/stack/shuffle'
import { chooseShuffle, countMoves } from '~/utils/stack/moves'
import type { EntranceStyle, ShufflePlan, ShuffleStyle, ShuffleView } from '~/utils/stack/shuffle'
import { averageColor, drawBack, drawSpine, spineFontsReady } from '~/utils/covers/bookFaces'
import type { FaceInput } from '~/utils/covers/bookFaces'
import { fullCoverTexture, loadCover, releaseFullCover } from '~/utils/covers/coverTextures'
import { isPhotoFace, loadAssets } from '~/utils/covers/bookAssets'
import type { LoadedAssets } from '~/utils/covers/bookAssets'
import { drawPageEdges, pageEdgePlan } from '~/utils/books/pageEdges'
import type { PageEdgePlan } from '~/utils/books/pageEdges'
import { loadDescription } from '~/utils/covers/descriptions'
import type { LoadedCover } from '~/utils/covers/coverTextures'
import { fromHex, readableOn } from '~/utils/covers/palette'
import type { RGB } from '~/utils/covers/palette'

const props = withDefaults(defineProps<{
  poses: BookPose[]
  books: Book[]
  /** Move a picked Book left of centre, clear of a details card on the right. */
  aside?: boolean
  /** How a re-sorted Stack moves (collision-free plans); 'instant' jumps. */
  shuffle?: ShuffleStyle | 'instant'
  /** Up to this many moved Books a re-sort uses the calm 'hand' style; null = always 'hand'. */
  shuffleThreshold?: number | null
  /** How Books new to the Stack appear during a re-sort (leaving Books mirror it). */
  entrance?: EntranceStyle
}>(), { aside: true, shuffle: 'instant', shuffleThreshold: null, entrance: 'fade' })

// --- Look: decided picks (dev server: live previews of open options) --------

/** Back cover typography: 'classic' paperback (decided) or 'clean' (dev preview). */
const look = useLook()
const backStyle = computed(() => look.value.backStyle)
/** Hovered Book, shared with the hover label and the Book list (hovering a record lifts its Book). */
const hoveredBook = useState<string | null>('books:hovered', () => null)

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
/** The picked Book fills this share of the view height. */
const INSPECT_FILL = 0.52
/** Share of the half view width the picked Book moves left, clear of the details card. */
const INSPECT_ASIDE = 0.3
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
  edges: { plan: PageEdgePlan, canvas: HTMLCanvasElement, textures: CanvasTexture[], materials: MeshStandardMaterial[] }
  /** Asset set faces (real or AI), when the Book has any. */
  assets: LoadedAssets | null
  /** The blurb once it has arrived, for redraws. */
  description?: string | null
  /** Last loaded Cover (null until/unless there is one), reused for redraws. */
  loaded: LoadedCover | null
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
  const inView = new Set(props.poses.map(pose => pose.bookId))
  return [...props.poses, ...extra.value.filter(pose => !inView.has(pose.bookId))]
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
  const textures = [head, tail, fore]
  const materials = textures.map((texture, index) => new MeshStandardMaterial({
    map: texture,
    bumpMap: texture,
    bumpScale: PAGE_BUMP,
    color: new Color(1, 1, 1).multiplyScalar(PAPER_ALBEDO * (index === 0 ? HEAD_DUST : 1)),
    roughness: 0.93,
    metalness: 0,
    envMapIntensity: 0.3,
  }))
  return { plan, canvas, textures, materials }
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

// Switching the back style redraws every back with what each Book already has.
watch(backStyle, () => {
  for (const pose of props.poses) {
    const entry = materialsByBook.get(pose.bookId)
    const input = entry && faceInput(pose, entry.loaded, entry.description ?? null, entry.assets)
    if (entry && input) setFace(entry, 'back', drawBack(input))
  }
})

function redrawPageEdges(entry: BookMaterials, board: RGB, bookId: string) {
  drawPageEdges(entry.edges.plan, board, bookId, entry.edges.canvas)
  for (const texture of entry.edges.textures) texture.needsUpdate = true
}

function faceInput(pose: BookPose, loaded: LoadedCover | null, description: string | null = null, assets: LoadedAssets | null = null): FaceInput | null {
  const book = booksById.value.get(pose.bookId)
  if (!book) return null
  const background = fromHex(pose.color)
  const text = readableOn(background)
  return {
    book,
    thickness: pose.thickness,
    height: pose.height,
    depth: pose.depth,
    palette: loaded?.palette ?? { background, text, accent: text },
    cover: loaded?.image,
    seed: hashString(book.id),
    description,
    spineArt: assets?.spine,
    backArt: assets?.back,
    // Asset set extras for a realistic back; photos of a real copy get no typography.
    quotes: assets?.entry.quotes,
    genre: assets?.entry.genre,
    publisher: assets?.entry.publisher,
    backIsPhoto: isPhotoFace(assets?.entry, 'back'),
    spineIsPhoto: isPhotoFace(assets?.entry, 'spine'),
    backStyle: backStyle.value,
  }
}

function materialsFor(pose: BookPose): Material[] {
  let entry = materialsByBook.get(pose.bookId)
  if (!entry) {
    const input = faceInput(pose, null)
    const cover = cloth(pose.color)
    const spineTexture = faceTexture(input ? drawSpine(input) : document.createElement('canvas'))
    const backTexture = faceTexture(input ? drawBack(input) : document.createElement('canvas'))
    const spine = printed(spineTexture)
    const back = printed(backTexture)
    const edges = pageEdgesFor(pose, fromHex(pose.color))
    const [head, tail, fore] = edges.materials as [Material, Material, Material]
    entry = { cover, back, spine, spineTexture, backTexture, edges, assets: null, loaded: null, opacity: 1, faces: [cover, back, head, tail, spine, fore] }
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
 * Puts the real Cover on a Book once it has loaded, and redraws Spine and back
 * (from the Cover when there is one) once the Spine fonts are available.
 */
async function applyCover(pose: BookPose) {
  const book = booksById.value.get(pose.bookId)
  if (!book) return
  const description = loadDescription(book)
  // Asset set first (its own front, spine and back), then the Cover resolver.
  const assets = await loadAssets(book)
  const cover = async () => (assets?.frontUrl ? await loadCover(book, assets.frontUrl) : null) ?? loadCover(book)
  const [loaded] = await Promise.all([cover(), spineFontsReady()])
  const entry = materialsByBook.get(pose.bookId)
  if (!entry) return
  entry.loaded = loaded
  entry.assets = assets

  if (loaded) {
    entry.cover.map = pickedId.value === pose.bookId ? fullCoverTexture(loaded) : loaded.texture
    entry.cover.color = new Color(1, 1, 1).multiplyScalar(COVER_ALBEDO)
    // Printed covers are smoother and glossier than cloth.
    entry.cover.roughness = 0.5
    setGloss(entry.cover, COVER_GLOSS)
    entry.cover.needsUpdate = true
  }

  const input = faceInput(pose, loaded, null, assets)
  if (!input) return
  // The cover boards seen on the page edges take the Spine's colour.
  const board = assets?.spine ? averageColor(assets.spine) : loaded?.palette.background ?? fromHex(pose.color)
  redrawPageEdges(entry, board, pose.bookId)
  setFace(entry, 'spine', drawSpine(input))
  setFace(entry, 'back', drawBack(input))

  // The blurb arrives separately; set it on the back when it does.
  const blurb = await description
  const current = materialsByBook.get(pose.bookId)
  if (!blurb || !current) return
  const withBlurb = faceInput(pose, current.loaded, blurb, current.assets)
  if (!withBlurb) return
  current.description = blurb
  setFace(current, 'back', drawBack(withBlurb))
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
}

watch(() => props.poses, (poses) => {
  for (const pose of poses) {
    if (!materialsByBook.has(pose.bookId)) {
      materialsFor(pose)
      applyCover(pose)
    }
  }
}, { immediate: true })

/** Frees the materials of Books that are neither in the view nor still on their way out. */
function sweep() {
  const keep = new Set(rendered.value.map(pose => pose.bookId))
  for (const [bookId, entry] of materialsByBook) {
    if (keep.has(bookId)) continue
    disposeEntry(entry)
    materialsByBook.delete(bookId)
    motionByBook.delete(bookId)
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
const { pickedId, face, click, putAway } = useBookPick()
const reducedMotion = usePreferredReducedMotion()
const reduced = computed(() => reducedMotion.value === 'reduce')

const glintLight = shallowRef<PointLight | null>(null)
let hoveredId: string | null = null

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

/** Not drawn right now: waiting to appear in a re-sort (the raycaster still finds it). */
const unseen = (bookId: string) => meshes.get(bookId)?.visible === false

function onEnter(bookId: string) {
  if (unseen(bookId)) return
  hoveredId = bookId
  hoveredBook.value = bookId
  setCursor('pointer')
  if (reduced.value || pickedId.value === bookId) return
  const glint = motionFor(bookId).glint
  gsap.fromTo(glint, { value: 0 }, { value: 1, duration: 0.9, ease: 'power1.inOut', overwrite: true })
}

function onLeave(bookId: string) {
  if (hoveredId === bookId) hoveredId = null
  if (hoveredBook.value === bookId) hoveredBook.value = null
  setCursor(dragging ? 'grabbing' : pickedId.value ? 'grab' : 'default')
}

function onClick(bookId: string, event: { stopPropagation?: () => void }) {
  event.stopPropagation?.()
  // A Book on its way into or out of the view can't be taken out.
  if (justDragged() || unseen(bookId) || !props.poses.some(pose => pose.bookId === bookId)) return
  click(bookId)
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
// and gives it back once it is back in place.
function setFullCover(bookId: string, on: boolean) {
  const entry = materialsByBook.get(bookId)
  if (!entry?.loaded) return
  entry.cover.map = on ? fullCoverTexture(entry.loaded) : entry.loaded.texture
  entry.cover.needsUpdate = true
  if (!on) releaseFullCover(entry.loaded)
}

watch(pickedId, (id, previous) => {
  if (id) setFullCover(id, true)
  if (previous && previous !== id) {
    setTimeout(() => {
      if (pickedId.value !== previous) setFullCover(previous, false)
    }, RETURN_SECONDS * 1000 + 100)
  }
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
let dragMoved = false
let lastX = 0
let lastY = 0

function onPointerDown(event: PointerEvent) {
  if (!pickedId.value) return
  dragging = true
  dragMoved = false
  lastX = event.clientX
  lastY = event.clientY
}

function onPointerMove(event: PointerEvent) {
  if (!dragging || !pickedId.value) return
  const dx = event.clientX - lastX
  const dy = event.clientY - lastY
  lastX = event.clientX
  lastY = event.clientY
  if (Math.abs(dx) + Math.abs(dy) > 0) dragMoved = true
  const spin = motionFor(pickedId.value).spin
  spin.x += dx * SPIN_PER_PX
  spin.y = MathUtils.clamp(spin.y + dy * SPIN_PER_PX, -1.3, 1.3)
  setCursor('grabbing')
}

function onPointerUp() {
  if (dragging && dragMoved) markDragEnd()
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
  window.addEventListener('pointerup', onPointerUp)
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
 * How a Book looks while it appears or vanishes, from presence 0 (gone) to 1.
 * 'fade' fades and grows a little, 'pop' grows out of nothing (a leaving Book
 * shrinks away), 'drop' only fades: its fall is part of the track.
 */
function presenceLook(presence: number, entrance: EntranceStyle, leaving: boolean): { opacity: number, scale: number } {
  if (presence >= 1) return FULLY_THERE
  const eased = smooth(presence)
  if (entrance === 'pop') {
    if (leaving) return { opacity: 1, scale: eased }
    const u = presence - 1
    return { opacity: Math.min(1, presence * 4), scale: 1 + (POP_BACK + 1) * u * u * u + POP_BACK * u * u }
  }
  if (entrance === 'drop') return { opacity: eased, scale: 1 }
  return { opacity: eased, scale: 0.9 + 0.1 * eased }
}

// --- Re-sort --------------------------------------------------------------------
// When the Stack is re-sorted or filtered, Books travel along a plan in which
// they never pass through each other (see utils/stack/shuffle.ts).

let running: { plan: ShufflePlan, startedAt: number, to: BookPose[] } | null = null
/** The last re-sort: how many Books moved, which style ran (dev choices) and when it ends (Stack separators). */
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

function startShuffle(from: BookPose[], to: BookPose[]) {
  if (props.shuffle === 'instant') {
    running = null
    extra.value = []
    sweep()
    return
  }
  const moves = countMoves(from, to)
  const style = chooseShuffle(moves, props.shuffleThreshold, props.shuffle)
  const view = viewBand(camera.value as PerspectiveCamera | undefined)
  const plan = planShuffle(from, to, style, { entrance: props.entrance, view })
  lastShuffle.value = { moves, style, until: performance.now() + plan.duration * 1000 }
  running = plan.duration > 0 ? { plan, startedAt: performance.now(), to } : null
  // Leaving Books stay drawn until they have vanished.
  extra.value = running ? from.filter(pose => plan.leaving.has(pose.bookId)) : []
  sweep()
}

watch(() => props.poses, (next, previous) => {
  if (!previous?.length || props.shuffle === 'instant' || reduced.value) {
    running = null
    queued = null
    requested = null
    extra.value = []
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
  requested = { from: requested?.from ?? previous, to: next }
  extra.value = requested.from.filter(pose => !staying.has(pose.bookId))
})

onBeforeRender(({ delta }) => {
  if (requested) {
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
  let glintBook: { mesh: Mesh, pose: BookPose, motion: Motion } | null = null

  for (const pose of rendered.value) {
    const mesh = meshes.get(pose.bookId)
    if (!mesh) continue
    const motion = motionFor(pose.bookId)
    const isPicked = pickedId.value === pose.bookId
    const hovered = hoveredId === pose.bookId || hoveredBook.value === pose.bookId
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
    // New to a re-sort that waits for the running one: not there yet.
    else if (running) presence = 0
    const appearance = presenceLook(presence, props.entrance, !!running?.plan.vanish.has(pose.bookId))
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
        // In front of the camera, sized to fill part of the view, a little above centre.
        cam.getWorldDirection(forward)
        up.copy(cam.up).applyQuaternion(cam.quaternion)
        const fov = MathUtils.degToRad(cam.fov ?? 38)
        const distance = pose.height / (2 * Math.tan(fov / 2) * INSPECT_FILL)
        // On wide views, sit left of centre so the details card (bottom right) doesn't cover it.
        right.crossVectors(forward, up).normalize()
        const halfWidth = distance * Math.tan(fov / 2) * (cam.aspect ?? 1)
        const aside = props.aside && (cam.aspect ?? 1) > 1.1 ? -halfWidth * INSPECT_ASIDE : 0
        inspectPosition.copy(cam.position)
          .addScaledVector(forward, distance)
          .addScaledVector(up, distance * 0.04)
          .addScaledVector(right, aside)
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

    // Shine: a hovered or picked Book catches the light.
    const shine = Math.max(motion.hover, pick * 0.6)
    const entry = materialsByBook.get(pose.bookId)
    if (entry) {
      applyShine(entry.spine, shine)
      applyShine(entry.cover, shine)
      applyShine(entry.back, shine)
    }

    if (hoveredId === pose.bookId && motion.glint.value < 1 && !isPicked) glintBook = { mesh, pose, motion }
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
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('keydown', onKey)
  if (controls.value) (controls.value as { enabled: boolean }).enabled = true
  for (const motion of motionByBook.values()) gsap.killTweensOf([motion.pick, motion.flip, motion.spin, motion.glint])
  geometry.dispose()
  for (const entry of materialsByBook.values()) disposeEntry(entry)
  materialsByBook.clear()
})
</script>

<template>
  <TresGroup name="books">
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
      @pointerenter="onEnter(pose.bookId)"
      @pointerleave="onLeave(pose.bookId)"
      @click="(event: { stopPropagation?: () => void }) => onClick(pose.bookId, event)"
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
