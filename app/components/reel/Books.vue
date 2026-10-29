<script setup lang="ts">
// The Books of a Reel (RegalBooksReel): every Book of the reel's own Library
// standing on the prototype's arc (utils/reel/layout.ts `reelPoseInto`, CSS px
// to mm), the world turned and pushed by the dolly (`reelCameraInto`), a soft
// floor shadow under each, the ones further than 2.6 Books from the front
// hidden. The meshes, materials and faces are the row's (components/row/Books.vue:
// a cloth Cover until its front loads, a typeset Spine, page edges, flat faces
// from `assets.color`), dressed from the reel's own faces (ReelContext.facesOf,
// never the shared Library: a member's Book ids may equal the visitor's).
// Only the Books near the front are dressed (DRESS_REACH either side, and the
// one taken out): their meshes, materials, Covers and drawn faces exist while
// they are near and are freed (GPU and canvases) once they are DROP_REACH away,
// so 300 Books cost what 7 do. Covers load nearest the front first.
//
// A Book taken out (the reel's own Pick, composables/useBookPick.ts) comes to
// the Inspect pose over the viewport (utils/books/inspect.ts `inspectFrame`, in
// the band above the Stack's sheet, or left of its card on a wide screen), as in
// the Stack: tap turns it, a drag spins it (utils/books/spin.ts), a sideways
// flick turns it over, a tap beside puts it back; put back it flies home from
// where it was shown. Reduce Motion: no flight, it appears in place.
import {
  BoxGeometry,
  Color,
  Euler,
  MathUtils,
  Matrix4,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three'
import type { CanvasTexture, Group, Material, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, PerspectiveCamera, Texture } from 'three'
import { useLoop, useTres } from '@tresjs/core'
import gsap from 'gsap'
import type { Book } from '#layers/regal/shared/types/book'
import type { BookPose } from '#layers/regal/app/utils/books/pose'
import { drawBack, drawSpine, spineFontsReady } from '#layers/regal/app/utils/covers/bookFaces'
import type { FaceInput } from '#layers/regal/app/utils/covers/bookFaces'
import { loadFullCover, loadOwnedCover, releaseFullCover, releaseOwnedCover } from '#layers/regal/app/utils/covers/coverTextures'
import type { LoadedCover } from '#layers/regal/app/utils/covers/coverTextures'
import type { AssetFaces } from '#layers/regal/app/utils/covers/bookAssets'
import { loadPicture } from '#layers/regal/app/utils/covers/images'
import type { Picture } from '#layers/regal/app/utils/covers/images'
import { reschedule, setBands } from '#layers/regal/app/utils/covers/loadQueue'
import type { Priority } from '#layers/regal/app/utils/covers/loadQueue'
import { BACKGROUND, LOAD_BANDS } from '#layers/regal/app/utils/covers/loadWindow'
import { drawPageEdges, pageEdgePlan } from '#layers/regal/app/utils/books/pageEdges'
import type { PageEdgePlan } from '#layers/regal/app/utils/books/pageEdges'
import { isClick, movePress, startPress } from '#layers/regal/app/utils/books/press'
import type { Press } from '#layers/regal/app/utils/books/press'
import { bookAt, toNdc } from '#layers/regal/app/utils/books/hit'
import { inspectFrame } from '#layers/regal/app/utils/books/inspect'
import { createSpin, dragSpin, glideSpin, resetSpin, spinQuaternion, startSettle, stopGlide } from '#layers/regal/app/utils/books/spin'
import type { Spin } from '#layers/regal/app/utils/books/spin'
import { CLOTH_COLORS, hashString } from '#layers/regal/app/utils/bookcase/layout'
import { toHex } from '#layers/regal/app/utils/covers/palette'
import { ART_HEIGHT, rowFaceInput } from '#layers/regal/app/utils/row/faces'
import type { ReelContext } from '#layers/regal/app/utils/reel/context'
import { reelCameraInto, reelDistance, reelPoseInto, REEL_WRAP_FROM } from '#layers/regal/app/utils/reel/layout'
import { planReelEntrance } from '#layers/regal/app/utils/reel/entrance'
import type { EntranceOffset } from '#layers/regal/app/utils/reel/entrance'
import type { ReelCamera, ReelPose } from '#layers/regal/app/utils/reel/layout'
import { clothMaterial, COVER_ALBEDO, faceTexture, HEAD_DUST, pageEdgeMaterial, printedMaterial, shadowMaterial } from '#layers/regal/app/utils/reel/materials'
import { REEL_BOOK, REEL_PX, REEL_SHADOW } from '#layers/regal/app/utils/reel/scene'

const props = defineProps<{
  books: Book[]
  ctx: ReelContext
}>()

const ctx = props.ctx
const { pickedId, face, clickAt, flip: turnOver } = useBookPick()
const pickContext = usePickContext()

// --- Look (the row's Books, lighter: the prototype's covers show their own colours) ---

const PULL_OUT = 0.04
const PULL_PHASE = 0.3
const OUT_SECONDS = 1.0
const RETURN_SECONDS = 0.8
const FLIP_SECONDS = 0.7
/** Px per ms a sideways release must reach to count as a flick (turns the Book over). */
const FLICK_SPEED = 0.9
/** Books this many places from the front (or nearer) are dressed: one beyond what shows (2.6). */
const DRESS_REACH = 3
/** Dressed Books this far from the front (or further) are freed: a margin, so a swipe to and fro doesn't redo them. */
const DROP_REACH = 5
/** The Spine is drawn at this share of its full 1024 px (the reel shows it under 200 CSS px tall). */
const SPINE_RESOLUTION = 0.5

const geometry = new BoxGeometry(1, 1, 1)
const shadowGeometry = new PlaneGeometry(1, 1)
const shadowTexture = shadowCanvasTexture()

interface BookMaterials {
  faces: Material[]
  cover: MeshPhysicalMaterial
  back: MeshPhysicalMaterial
  spine: MeshPhysicalMaterial
  spineTexture: CanvasTexture
  backTexture: CanvasTexture
  edges: { plan: PageEdgePlan, canvas: HTMLCanvasElement, textures: CanvasTexture[], materials: MeshStandardMaterial[] }
  shadow: MeshBasicMaterial
  set: AssetFaces | null
  loaded: LoadedCover | null
  /** A drawn front (no Cover): the title block on its colour. */
  drawnFront: CanvasTexture | null
  fullCover: string | null
  /** Its front and Spine are in (or will never come): what `ready` waits for. */
  ready: boolean
  backDrawn: boolean
  aborted: AbortController
}

interface Motion {
  pick: { value: number }
  flip: { value: number }
  spin: Spin
  returnFrom: { position: Vector3, quaternion: Quaternion } | null
}

const materialsByBook = new Map<string, BookMaterials>()
const motionByBook = new Map<string, Motion>()
const meshes = new Map<string, Mesh>()
const shadows = new Map<string, Mesh>()

/** The prototype's Book in world units, the same for every Book (as the owner picked it). */
function poseOf(book: Book): BookPose {
  return {
    bookId: book.id,
    x: 0,
    y: 0,
    z: 0,
    rotation: [0, 0, 0],
    thickness: REEL_BOOK.thickness * REEL_PX,
    height: REEL_BOOK.height * REEL_PX,
    depth: REEL_BOOK.width * REEL_PX,
    color: CLOTH_COLORS[hashString(book.id) % CLOTH_COLORS.length]!,
    section: book.status,
  }
}

const poses = computed(() => props.books.map(poseOf))
const indexById = computed(() => new Map(props.books.map((book, index) => [book.id, index])))
const booksById = computed(() => new Map(props.books.map(book => [book.id, book])))

/** The prototype's floor shadow: radial-gradient(closest-side, rgba(30,20,10,.28), transparent), stretched to the ellipse. */
function shadowCanvasTexture(): CanvasTexture | null {
  if (!import.meta.client) return null
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')!
  const [r, g, b] = REEL_SHADOW.rgb
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${REEL_SHADOW.alpha})`)
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  return faceTexture(canvas)
}

function plainCanvas(color: string): HTMLCanvasElement {
  const element = document.createElement('canvas')
  element.width = 2
  element.height = 2
  const context = element.getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, 2, 2)
  return element
}

/** The Book's colour before its faces: its one colour (flat, `assets.color`), else its cloth. */
function colorOf(pose: BookPose): string {
  const flat = ctx.facesOf(pose.bookId)?.flat
  return flat ? toHex(flat) : pose.color
}

function pageEdgesFor(pose: BookPose): BookMaterials['edges'] {
  const book = booksById.value.get(pose.bookId)
  const plan = pageEdgePlan(book ?? { id: pose.bookId, pages: null, binding: null }, pose.thickness, pose.depth)
  const canvas = document.createElement('canvas')
  canvas.width = plan.width
  canvas.height = plan.height
  const context = canvas.getContext('2d')!
  context.fillStyle = `rgb(${plan.paper.map(channel => Math.round(channel)).join(' ')})`
  context.fillRect(0, 0, plan.width, plan.height)
  const head = faceTexture(canvas)
  const tail = head.clone()
  tail.repeat.set(1, -1)
  tail.offset.set(0, 1)
  const fore = head.clone()
  fore.repeat.set(1, 0.5)
  fore.offset.set(0, 0.25)
  return { plan, canvas, textures: [head, tail, fore], materials: [pageEdgeMaterial(head, HEAD_DUST), pageEdgeMaterial(tail), pageEdgeMaterial(fore)] }
}

function materialsFor(pose: BookPose): Material[] {
  let entry = materialsByBook.get(pose.bookId)
  if (!entry) {
    const color = colorOf(pose)
    const cover = clothMaterial(color)
    const spineTexture = faceTexture(plainCanvas(color))
    const backTexture = faceTexture(plainCanvas(color))
    const spine = printedMaterial(spineTexture)
    const back = printedMaterial(backTexture)
    const edges = pageEdgesFor(pose)
    const [head, tail, fore] = edges.materials as [MeshStandardMaterial, MeshStandardMaterial, MeshStandardMaterial]
    const shadow = shadowMaterial(shadowTexture)
    entry = {
      cover, back, spine, spineTexture, backTexture, edges, shadow,
      set: null, loaded: null, drawnFront: null, fullCover: null, ready: false, backDrawn: false,
      aborted: new AbortController(),
      faces: [cover, back, head, tail, spine, fore],
    }
    materialsByBook.set(pose.bookId, entry)
    // Its faces load and draw as soon as it is dressed.
    void applyFaces(pose)
  }
  return entry.faces
}

function shadowFor(pose: BookPose): Material {
  materialsFor(pose)
  return materialsByBook.get(pose.bookId)!.shadow
}

function motionFor(bookId: string): Motion {
  let motion = motionByBook.get(bookId)
  if (!motion) {
    motion = { pick: { value: 0 }, flip: { value: 0 }, spin: createSpin(), returnFrom: null }
    motionByBook.set(bookId, motion)
  }
  return motion
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

function faceInput(pose: BookPose, entry: BookMaterials, description: string | null = null, backArt?: Picture): FaceInput | null {
  const book = booksById.value.get(pose.bookId)
  if (!book) return null
  // A Book without a Cover nor colours of its own: drawn flat in its cloth colour, as a flat Book.
  const flat = !entry.set?.palette && !entry.loaded
  const input = rowFaceInput(book, pose, { set: entry.set, loaded: entry.loaded, description, backArt })
  return flat ? { ...input, flat: true } : input
}

function printCover(entry: BookMaterials, texture: Texture) {
  entry.cover.map = texture
  entry.cover.color = new Color(1, 1, 1).multiplyScalar(COVER_ALBEDO)
  entry.cover.roughness = 0.5
  entry.cover.clearcoat = 0.35
  entry.cover.clearcoatRoughness = 0.35
  entry.cover.needsUpdate = true
}

// Load order: nearest the front first (shown), the rest in the background.
setBands(LOAD_BANDS)
function rankOf(bookId: string): number {
  if (pickedId.value === bookId) return -3
  const index = indexById.value.get(bookId)
  if (index === undefined) return BACKGROUND + 50
  const distance = Math.abs(reelDistance(index, ctx.focus.value, props.books.length))
  return distance <= DRESS_REACH ? distance : BACKGROUND + distance
}

/** The load queue's priority of a Book's faces (asked again whenever the queue picks a job). */
function priorityOf(bookId: string): Priority {
  return () => rankOf(bookId)
}

// Draws (Spines, fronts, backs) wait for a frame with time to spare.
const DRAW_BUDGET_MS = 6
const drawQueue: { bookId: string, rank: number, run: () => void }[] = []
const byRank = (a: { rank: number }, b: { rank: number }) => a.rank - b.rank
function whenDrawn(entry: BookMaterials, bookId: string, draw: (entry: BookMaterials) => void): Promise<boolean> {
  return new Promise(resolve => drawQueue.push({
    bookId,
    rank: 0,
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
  // Each Book's rank once per pass, then sort by it (no closure per comparison).
  for (const item of drawQueue) item.rank = rankOf(item.bookId)
  drawQueue.sort(byRank)
  while (drawQueue.length && performance.now() - started < DRAW_BUDGET_MS) drawQueue.shift()!.run()
}

/** Dresses a Book: its Cover (the pile copy), the Spine typeset on its colours, the page edges. */
async function applyFaces(pose: BookPose) {
  const entry = materialsByBook.get(pose.bookId)
  if (!entry) return
  const set = ctx.facesOf(pose.bookId)
  entry.set = set
  const priority = priorityOf(pose.bookId)
  const fonts = spineFontsReady()
  const signal = entry.aborted.signal
  // Its own copy of the Cover (freed when the Book is far again), the pile copy first.
  const front = (set?.pileFront ? loadOwnedCover(set.pileFront, priority, signal) : Promise.resolve(null))
    .then(loaded => loaded ?? (set?.front && set.front !== set.pileFront ? loadOwnedCover(set.front, priority, signal) : null))
  const spineArt = set?.spine ? loadPicture(set.spine, priority, set.entry.pile?.spine ? undefined : ART_HEIGHT, signal) : Promise.resolve(null)
  const [loaded, art] = await Promise.all([front, spineArt, fonts])
  if (signal.aborted) {
    if (loaded) releaseOwnedCover(loaded)
    return closePicture(art)
  }
  const drawn = await whenDrawn(entry, pose.bookId, (current) => {
    current.loaded = loaded
    const input = faceInput(pose, current)
    if (loaded) {
      if (!current.fullCover) printCover(current, loaded.texture)
    }
    else if (input) {
      // No Cover: its front drawn like a flat Book's (its title block on its colour), as the row does.
      current.drawnFront = faceTexture(drawBack(input))
      if (!current.fullCover) printCover(current, current.drawnFront)
    }
    if (input) {
      setFace(current, 'spine', drawSpine({ ...input, spineArt: art ?? undefined, resolution: SPINE_RESOLUTION }))
      drawPageEdges(current.edges.plan, set?.spineColor ?? input.palette.background, pose.bookId, current.edges.canvas)
      for (const texture of current.edges.textures) texture.needsUpdate = true
    }
    current.ready = true
  })
  if (!drawn && loaded) releaseOwnedCover(loaded)
  closePicture(art)
}

function closePicture(picture: Picture | null | undefined) {
  if (picture && 'close' in picture && typeof picture.close === 'function') picture.close()
}

/** Frees a Book's dress: materials and textures on the GPU, its Cover and drawn canvases. */
function disposeEntry(entry: BookMaterials) {
  entry.aborted.abort()
  for (const material of [entry.cover, entry.back, entry.spine, entry.shadow, ...entry.edges.materials]) material.dispose()
  for (const texture of [entry.spineTexture, entry.backTexture, entry.drawnFront, ...entry.edges.textures]) {
    if (!texture) continue
    texture.dispose()
    const canvas = texture.image as HTMLCanvasElement | undefined
    if (canvas && 'width' in canvas) canvas.width = 0
  }
  if (entry.loaded) releaseOwnedCover(entry.loaded)
  if (entry.fullCover) releaseFullCover(entry.fullCover)
}

/**
 * The Books dressed now (ids, in no particular order): DRESS_REACH either side
 * of the front, the one taken out and one on its way back; a dressed Book stays
 * until it is DROP_REACH away. Set from the frame loop when the front Book
 * changes, so the meshes in the template change only then.
 */
const dressed = shallowRef<readonly string[]>([])
const dressedSet = new Set<string>()
let dressedCentre = Number.NaN
let dressedPick: string | null = null
const wanted = new Set<string>()

function updateDressing(focus: number) {
  const n = props.books.length
  const centre = Math.round(focus)
  if (centre === dressedCentre && dressedPick === pickedId.value) return
  dressedCentre = centre
  dressedPick = pickedId.value
  wanted.clear()
  for (let step = -DRESS_REACH; step <= DRESS_REACH; step++) {
    let index = centre + step
    if (n >= REEL_WRAP_FROM) index = ((index % n) + n) % n
    else if (index < 0 || index >= n) continue
    wanted.add(props.books[index]!.id)
  }
  for (const id of dressedSet) {
    const index = indexById.value.get(id)
    const busy = id === pickedId.value || (motionByBook.get(id)?.pick.value ?? 0) > 0
    if (busy || (index !== undefined && Math.abs(reelDistance(index, focus, n)) < DROP_REACH)) wanted.add(id)
  }
  if (pickedId.value && indexById.value.has(pickedId.value)) wanted.add(pickedId.value)
  if (wanted.size === dressedSet.size && [...wanted].every(id => dressedSet.has(id))) return
  dressedSet.clear()
  for (const id of wanted) dressedSet.add(id)
  dressed.value = [...wanted]
  // Dev only: how many Books are dressed (a 300-Book reel must stay at a handful).
  if (import.meta.dev) (window as { __regalReelDressed?: number }).__regalReelDressed = dressedSet.size
}

/** The dressed Books with their poses and places, for the template. */
const dressedBooks = computed(() => dressed.value
  .map(id => ({ id, index: indexById.value.get(id) ?? -1 }))
  .filter(item => item.index >= 0)
  .map(item => ({ ...item, pose: poses.value[item.index]! })))

// Books no longer dressed are freed, after their meshes left the scene (the template
// dresses the new ones: materialsFor).
watch(dressed, (_, before) => {
  for (const id of before ?? []) {
    if (dressedSet.has(id)) continue
    const entry = materialsByBook.get(id)
    if (entry) disposeEntry(entry)
    materialsByBook.delete(id)
    motionByBook.delete(id)
  }
}, { flush: 'post' })

// Another Library: everything is dressed anew around the front.
watch(() => props.books, () => {
  for (const entry of materialsByBook.values()) disposeEntry(entry)
  materialsByBook.clear()
  motionByBook.clear()
  dressedSet.clear()
  dressedCentre = Number.NaN
  dressed.value = []
  updateDressing(ctx.focus.value)
})
updateDressing(ctx.focus.value)

// --- The Book taken out ----------------------------------------------------------------

const { camera, renderer, sizes } = useTres()
const { onBeforeRender } = useLoop()
const reduced = computed(() => ctx.reduced.value)

function tween(target: { value: number }, value: number, seconds: number) {
  if (reduced.value || seconds <= 0) {
    gsap.killTweensOf(target)
    target.value = value
    return
  }
  gsap.to(target, { value, duration: seconds, ease: 'power2.inOut', overwrite: true })
}

function settleSpin(spin: Spin, seconds: number) {
  gsap.to(spin, { ...startSettle(spin), duration: reduced.value || seconds <= 0 ? 0 : seconds, ease: 'power2.inOut', overwrite: true })
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

/** The full Cover and drawn back of a Book put back go once it is home. */
const releaseTimers = new Set<ReturnType<typeof setTimeout>>()

watch(pickedId, (id, previous) => {
  const seconds = ctx.instantReturn.value ? 0 : RETURN_SECONDS
  if (previous) {
    const motion = motionFor(previous)
    holdForReturn(previous, motion)
    tween(motion.pick, 0, seconds)
    tween(motion.flip, 0, seconds)
    settleSpin(motion.spin, seconds)
    const timer = setTimeout(() => {
      releaseTimers.delete(timer)
      if (pickedId.value === previous) return
      setFullCover(previous, false)
      releaseBack(previous)
    }, seconds * 1000 + 100)
    releaseTimers.add(timer)
  }
  tween(ctx.dim, id ? 1 : 0, id ? OUT_SECONDS * 0.6 : seconds)
  if (id) {
    const motion = motionFor(id)
    motion.returnFrom = null
    gsap.killTweensOf(motion.spin)
    resetSpin(motion.spin)
    motion.flip.value = 0
    tween(motion.pick, 1, OUT_SECONDS)
    setFullCover(id, true)
    void drawBackOf(id)
  }
  reschedule()
})

watch(face, (value) => {
  if (!pickedId.value) return
  const motion = motionFor(pickedId.value)
  tween(motion.flip, value === 'back' ? Math.PI : 0, FLIP_SECONDS)
  settleSpin(motion.spin, FLIP_SECONDS)
})

/** The Cover at full size while the Book is out. */
function setFullCover(bookId: string, on: boolean) {
  const entry = materialsByBook.get(bookId)
  if (!entry) return
  if (on) {
    const url = entry.set?.front
    if (!url || entry.fullCover === url) return
    entry.fullCover = url
    void loadFullCover(url, priorityOf(bookId)).then((texture) => {
      const current = materialsByBook.get(bookId)
      if (texture && current?.fullCover === url) printCover(current, texture)
    })
    return
  }
  const url = entry.fullCover
  if (!url) return
  entry.fullCover = null
  const small = entry.loaded?.texture ?? entry.drawnFront
  if (small) printCover(entry, small)
  releaseFullCover(url)
}

/** The back is drawn only for the Book taken out (its art when the file has one; flat, a printed back). */
async function drawBackOf(bookId: string) {
  const entry = materialsByBook.get(bookId)
  const pose = poses.value.find(candidate => candidate.bookId === bookId)
  if (!entry || !pose || entry.backDrawn) return
  entry.backDrawn = true
  const art = entry.set?.back ? await loadPicture(entry.set.back, priorityOf(bookId), ART_HEIGHT, entry.aborted.signal) : null
  if (!entry.backDrawn || materialsByBook.get(bookId) !== entry) return closePicture(art)
  await whenDrawn(entry, bookId, (current) => {
    const description = booksById.value.get(bookId)?.description?.trim() || null
    const input = faceInput(pose, current, description, art ?? undefined)
    if (input) setFace(current, 'back', drawBack(input))
  })
  closePicture(art)
}

function releaseBack(bookId: string) {
  const entry = materialsByBook.get(bookId)
  if (!entry?.backDrawn) return
  entry.backDrawn = false
  const drawn = entry.backTexture.image as HTMLCanvasElement
  setFace(entry, 'back', plainCanvas(entry.cover.userData.cloth as string))
  drawn.width = 0
}

// --- Pointer: taps, and turning the Book taken out --------------------------------------

const group = shallowRef<Group | null>(null)
let press: Press | null = null
let aimed: string | null = null
let dragging = false
let lastX = 0
let lastY = 0
let dragSpeed = 0
let lastMoveAt = 0

function canvas() {
  return renderer.domElement as HTMLCanvasElement | undefined
}

function setCursor(value: string) {
  const element = canvas()
  if (element) element.style.cursor = value
}

/** Hidden Books (beyond the arc's fade) and a Book on its way can't be hit. */
function hittable(bookId: string): boolean {
  return meshes.get(bookId)?.visible !== false
}

function onDown(event: PointerEvent) {
  const element = canvas()
  const point = element && event.button === 0 && event.isPrimary ? toNdc(element, event.clientX, event.clientY) : null
  press = point ? startPress(event) : null
  aimed = point ? bookAt(group.value, camera.value, point, hittable) : null
  // A finger is wider than an edge: a tap that misses looks a little to either side.
  if (point && !aimed && event.pointerType !== 'mouse' && element) {
    const width = element.getBoundingClientRect().width
    const [x, y] = [point.x, point.y]
    for (const px of [8, -8, 16, -16]) {
      aimed = bookAt(group.value, camera.value, point.set(x + 2 * px / width, y), hittable)
      if (aimed) break
    }
    point.set(x, y)
  }
  if (pickedId.value) {
    const spin = motionFor(pickedId.value).spin
    gsap.killTweensOf(spin)
    stopGlide(spin)
    dragging = true
    lastX = event.clientX
    lastY = event.clientY
    dragSpeed = 0
    lastMoveAt = event.timeStamp
  }
}

function onMove(event: PointerEvent) {
  if (press) press = movePress(press, event)
  if (dragging && !(event.buttons & 1)) dragging = false
  if (!dragging || !pickedId.value) return
  const dx = event.clientX - lastX
  const dy = event.clientY - lastY
  const dt = Math.max(1, event.timeStamp - lastMoveAt)
  dragSpeed = dragSpeed * 0.5 + (dx / dt) * 0.5
  lastMoveAt = event.timeStamp
  lastX = event.clientX
  lastY = event.clientY
  const mode = ctx.rotate.value
  dragSpin(motionFor(pickedId.value).spin, dx, dy, mode, { tip: mode === 'free' || event.pointerType === 'mouse', ms: dt })
  setCursor('grabbing')
}

function onUp(event: PointerEvent) {
  const resting = event.timeStamp - lastMoveAt >= 80
  const flicked = dragging && Math.abs(dragSpeed) > FLICK_SPEED && !resting
  if (dragging && resting && pickedId.value) stopGlide(motionFor(pickedId.value).spin)
  const wasDragging = dragging
  dragging = false
  if (pickedId.value) setCursor('grab')
  if (flicked && pickedId.value) {
    turnOver()
    press = null
    return
  }
  const ended = press
  press = null
  const element = canvas()
  if (!element || event.target !== element || !isClick(ended, event)) return
  if (pickedId.value) {
    // Tap the Book: it turns; tap again: back into the reel; tap beside it: back into the reel.
    clickAt(aimed, 'put-back')
    return
  }
  if (wasDragging || ctx.caught.value) return
  const index = aimed ? indexById.value.get(aimed) : undefined
  ctx.tap(index ?? -1)
}

function onCancel() {
  press = null
  dragging = false
}

type BookPointerEvent = { object?: { userData?: { bookId?: string } } }
function onEnter(event: BookPointerEvent) {
  if (!event.object?.userData?.bookId) return
  setCursor(pickedId.value ? 'grab' : 'pointer')
}
function onLeave() {
  setCursor(pickedId.value ? 'grab' : 'default')
}

onMounted(() => {
  canvas()?.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
})

// --- Per frame -------------------------------------------------------------------------

const arcPose: ReelPose = { distance: 0, x: 0, y: 0, z: 0, rotateY: 0, opacity: 0, shadow: 0, zIndex: 0 }
const dolly: ReelCamera = { z: 0, rotateY: 0, rotateX: 0 }
const entranceOffset: EntranceOffset = { dx: 0, scale: 1 }
/** The floor shadow's size at rest (m), as the template sets it. */
const SHADOW_SCALE = { x: REEL_SHADOW.width * REEL_BOOK.width * REEL_PX, y: REEL_SHADOW.depth * REEL_PX }

/** The Books the arc shows at `focus` and where they stand on the stage (px): what the entrance is planned for. */
function shownAt(focus: number, n: number): { index: number, x: number }[] {
  const out: { index: number, x: number }[] = []
  for (let index = 0; index < n; index++) {
    reelPoseInto(index, focus, n, arcPose)
    if (arcPose.opacity > 0) out.push({ index, x: arcPose.x })
  }
  return out
}
const world = new Matrix4()
const worldPosition = new Vector3()
const worldQuaternion = new Quaternion()
const worldScale = new Vector3(1, 1, 1)
const worldEuler = new Euler(0, 0, 0, 'YXZ')
const basePosition = new Vector3()
const pulledPosition = new Vector3()
const inspectPosition = new Vector3()
const baseQuaternion = new Quaternion()
const inspectQuaternion = new Quaternion()
const partial = new Quaternion()
const forward = new Vector3()
const up = new Vector3()
const ray = new Vector3()
const lookDummy = new Object3D()
const lookAhead = new Vector3()
const Y_AXIS = new Vector3(0, 1, 0)
const X_AXIS = new Vector3(1, 0, 0)
const SHADOW_TILT = new Quaternion().setFromAxisAngle(X_AXIS, -MathUtils.degToRad(REEL_SHADOW.tilt))
const smooth = (t: number) => t * t * (3 - 2 * t)

/** What covers the viewport around a Book taken out (px), eased so the Book glides when the sheet changes. */
const inset = { top: 0, bottom: 0 }
function followInsets(height: number, rate: number) {
  const sheetTop = pickContext.insets.value.sheetTop
  const bottom = sheetTop === null ? 0 : Math.max(0, height - sheetTop)
  inset.top += (0 - inset.top) * rate
  inset.bottom += (bottom - inset.bottom) * rate
}

/**
 * The Inspect pose over the viewport: `inspectFrame` (the Stack's fill, lift
 * and band) in the window the camera shows, the Book parallel to the picture.
 */
function inspectTarget(cam: PerspectiveCamera, into: Vector3) {
  const width = sizes.width.value || 1
  const height = sizes.height.value || 1
  // Focal length (px) of what the canvas shows, and its half field of view.
  const focal = cam.projectionMatrix.elements[5]! * height / 2
  const tan = height / 2 / focal
  const frame = inspectFrame({
    fov: 2 * Math.atan(tan),
    aspect: width / height,
    height: REEL_BOOK.height * REEL_PX,
    depth: REEL_BOOK.width * REEL_PX,
    top: inset.top / height,
    bottom: inset.bottom / height,
    aside: width > 560,
  })
  // Where that is in the canvas, and the point at that depth along the ray through it.
  const ndcY = frame.up / (frame.distance * tan)
  const ndcX = frame.right / (frame.distance * tan * (width / height))
  ray.set(ndcX, ndcY, 0.5).unproject(cam).sub(cam.position).normalize()
  cam.getWorldDirection(forward)
  return into.copy(cam.position).addScaledVector(ray, frame.distance / Math.max(0.2, ray.dot(forward)))
}

onBeforeRender(({ delta }) => {
  // Off screen (and not broken out) nothing is drawn: no frame's work either (ReelScene stops the loop too).
  if (!ctx.visible.value) return
  const seconds = delta ?? 0.016
  const cam = camera.value as PerspectiveCamera | undefined
  const n = props.books.length
  const focus = ctx.focus.value
  updateDressing(focus)
  drawPending()
  const height = sizes.height.value || 1
  followInsets(height, 1 - Math.exp(-seconds * 10))

  // The world: pushed in and swayed by the dolly, tilted back 4° (CSS rotateX(-4deg)).
  reelCameraInto(reduced.value ? 0 : ctx.dolly.value, dolly)
  worldEuler.set(MathUtils.degToRad(-dolly.rotateX), MathUtils.degToRad(dolly.rotateY), 0, 'YXZ')
  worldQuaternion.setFromEuler(worldEuler)
  // The arc's origin stands `rise` above the stage's middle (scene.ts REEL_RISE); the turn is about it.
  worldPosition.set(0, ctx.rise.value * REEL_PX, dolly.z * REEL_PX)
  world.compose(worldPosition, worldQuaternion, worldScale)

  // The entrance (utils/reel/entrance.ts): planned from the Books this first frame shows, played from the canvas's takeover.
  const entrance = ctx.entrance
  let entering = false
  let entranceTime = -1
  if (!entrance.done) {
    if (!entrance.plan) entrance.plan = planReelEntrance(entrance.mode, shownAt(focus, n))
    entering = true
    entranceTime = entrance.startedAt < 0 ? -1 : (performance.now() - entrance.startedAt) / 1000
    // This frame is the last of it (the Books at rest): the next ones draw them as they are.
    if (entranceTime >= entrance.plan.duration && entrance.startedAt >= 0) entrance.done = true
  }

  let allReady = true
  // Only the dressed Books (around the front): the others have no mesh.
  const list = dressedBooks.value
  for (let item = 0; item < list.length; item++) {
    const { id, index } = list[item]!
    const mesh = meshes.get(id)
    const shadowMesh = shadows.get(id)
    if (!mesh) continue
    const book = props.books[index]!
    const entry = materialsByBook.get(book.id)
    const motion = motionFor(book.id)
    reelPoseInto(index, focus, n, arcPose)
    const pose = arcPose
    const offset: EntranceOffset | null = entering ? entrance.plan!.at(index, entranceTime, entranceOffset) : null
    const shown = pose.opacity > 0 && (!offset || offset.scale > 0.001)
    const present = pose.opacity > 0
    if (entry && present && !entry.ready) allReady = false

    // CSS (y down) to the scene (y up), px to m; the Cover (+x) turned to the front (-90°).
    basePosition.set(pose.x * REEL_PX, -pose.y * REEL_PX, pose.z * REEL_PX).applyMatrix4(world)
    if (offset) {
      basePosition.x += offset.dx
      const dressed = poses.value[index]!
      mesh.scale.set(dressed.thickness * offset.scale, dressed.height * offset.scale, dressed.depth * offset.scale)
    }
    baseQuaternion.copy(worldQuaternion).multiply(partial.setFromAxisAngle(Y_AXIS, MathUtils.degToRad(pose.rotateY) - Math.PI / 2))

    const pick = motion.pick.value
    mesh.visible = shown || pick > 0
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
      const isPicked = pickedId.value === book.id
      const t = smooth(Math.max(0, (pick - PULL_PHASE) / (1 - PULL_PHASE)))
      if (pick <= PULL_PHASE) {
        mesh.position.lerpVectors(basePosition, pulledPosition, smooth(pick / PULL_PHASE))
        mesh.quaternion.copy(baseQuaternion)
      }
      else if (motion.returnFrom && !isPicked) {
        // On its way home: from where it was shown (held relative to the camera) to its place on the arc.
        cam.updateMatrixWorld()
        inspectPosition.copy(motion.returnFrom.position).applyMatrix4(cam.matrixWorld)
        cam.getWorldQuaternion(inspectQuaternion).multiply(motion.returnFrom.quaternion)
        mesh.position.lerpVectors(pulledPosition, inspectPosition, t)
        mesh.quaternion.slerpQuaternions(baseQuaternion, inspectQuaternion, t)
      }
      else {
        up.copy(cam.up).applyQuaternion(cam.quaternion)
        inspectTarget(cam, inspectPosition)
        // Parallel to the picture (off the camera's axis it would show keystoned).
        cam.getWorldDirection(lookAhead)
        lookDummy.position.copy(inspectPosition)
        lookDummy.up.copy(up)
        lookDummy.lookAt(lookAhead.multiplyScalar(-1).add(inspectPosition))
        if (isPicked && !dragging) glideSpin(motion.spin, seconds * 1000, ctx.rotate.value)
        inspectQuaternion.copy(lookDummy.quaternion)
          .multiply(spinQuaternion(motion.spin, ctx.rotate.value, partial))
          .multiply(partial.setFromAxisAngle(Y_AXIS, motion.flip.value - Math.PI / 2))
        mesh.position.lerpVectors(pulledPosition, inspectPosition, t)
        mesh.quaternion.slerpQuaternions(baseQuaternion, inspectQuaternion, t)
      }
    }

    if (shadowMesh && entry) {
      const strength = shown ? pose.shadow * ctx.floorShadow.value * (1 - Math.min(1, pick * 2)) : 0
      shadowMesh.visible = strength > 0.001
      entry.shadow.opacity = strength
      if (shadowMesh.visible) {
        shadowMesh.position.set(pose.x * REEL_PX, -REEL_SHADOW.drop * REEL_PX, pose.z * REEL_PX).applyMatrix4(world)
        if (offset) {
          shadowMesh.position.x += offset.dx
          shadowMesh.scale.set(SHADOW_SCALE.x * offset.scale, SHADOW_SCALE.y * offset.scale, 1)
        }
        shadowMesh.quaternion.copy(worldQuaternion).multiply(SHADOW_TILT)
      }
    }
  }
  if (allReady && n > 0 && !ctx.facesReady.value) ctx.facesReady.value = true
})

onBeforeUnmount(() => {
  for (const timer of releaseTimers) clearTimeout(timer)
  releaseTimers.clear()
  canvas()?.removeEventListener('pointerdown', onDown)
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onCancel)
  for (const motion of motionByBook.values()) gsap.killTweensOf([motion.pick, motion.flip, motion.spin])
  gsap.killTweensOf(ctx.dim)
  geometry.dispose()
  shadowGeometry.dispose()
  shadowTexture?.dispose()
  for (const entry of materialsByBook.values()) disposeEntry(entry)
  materialsByBook.clear()
})

function setMesh(map: Map<string, Mesh>, bookId: string, element: unknown) {
  const object = (element as { isObject3D?: boolean } | null)?.isObject3D
    ? element as Mesh
    : (element as { value?: Mesh } | null)?.value
  if (object) map.set(bookId, object)
  else map.delete(bookId)
}
</script>

<template>
  <TresGroup name="reel-shadows">
    <TresMesh
      v-for="item in dressedBooks"
      :key="item.id"
      :ref="(element: unknown) => setMesh(shadows, item.id, element)"
      :name="`shadow:${item.id}`"
      :geometry="shadowGeometry"
      :material="shadowFor(item.pose)"
      :scale="[SHADOW_SCALE.x, SHADOW_SCALE.y, 1]"
      :render-order="-1"
      :visible="false"
    />
  </TresGroup>
  <TresGroup
    ref="group"
    name="reel-books"
  >
    <TresMesh
      v-for="item in dressedBooks"
      :key="item.id"
      :ref="(element: unknown) => setMesh(meshes, item.id, element)"
      :name="`book:${item.id}`"
      :user-data="{ bookId: item.id, index: item.index }"
      :geometry="geometry"
      :material="materialsFor(item.pose)"
      :scale="[item.pose.thickness, item.pose.height, item.pose.depth]"
      @pointerenter="onEnter"
      @pointerleave="onLeave"
    />
  </TresGroup>
</template>
