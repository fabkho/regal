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
import type { Book } from '#shared/types/book'
import { hashString } from '~/utils/bookcase/layout'
import type { BookPose } from '~/utils/books/pose'
import { justDragged, markDragEnd } from '~/utils/books/dragGuard'
import { drawBack, drawSpine, spineFontsReady } from '~/utils/covers/bookFaces'
import type { FaceInput } from '~/utils/covers/bookFaces'
import { loadCover } from '~/utils/covers/coverTextures'
import type { LoadedCover } from '~/utils/covers/coverTextures'
import { fromHex, readableOn } from '~/utils/covers/palette'

const props = defineProps<{ poses: BookPose[], books: Book[] }>()

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
const pages = new MeshStandardMaterial({ color: '#CFC3A8', roughness: 0.92, metalness: 0, envMapIntensity: 0.35 })

interface BookMaterials {
  /** BoxGeometry face order: +x (front cover), -x (back), +y, -y, +z (spine, facing the room), -z (fore-edge). */
  faces: Material[]
  cover: MeshPhysicalMaterial
  back: MeshPhysicalMaterial
  spine: MeshPhysicalMaterial
  spineTexture: CanvasTexture
  backTexture: CanvasTexture
}

interface Motion {
  hover: number
  pick: { value: number }
  flip: { value: number }
  spin: { x: number, y: number }
  glint: { value: number }
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

function faceInput(pose: BookPose, loaded: LoadedCover | null): FaceInput | null {
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
    entry = { cover, back, spine, spineTexture, backTexture, faces: [cover, back, pages, pages, spine, pages] }
    materialsByBook.set(pose.bookId, entry)
  }
  return entry.faces
}

function motionFor(bookId: string): Motion {
  let motion = motionByBook.get(bookId)
  if (!motion) {
    motion = { hover: 0, pick: { value: 0 }, flip: { value: 0 }, spin: { x: 0, y: 0 }, glint: { value: 1 } }
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
  const [loaded] = await Promise.all([loadCover(book), spineFontsReady()])
  const entry = materialsByBook.get(pose.bookId)
  if (!entry) return

  if (loaded) {
    entry.cover.map = loaded.texture
    entry.cover.color = new Color(1, 1, 1).multiplyScalar(COVER_ALBEDO)
    // Printed covers are smoother and glossier than cloth.
    entry.cover.roughness = 0.5
    setGloss(entry.cover, COVER_GLOSS)
    entry.cover.needsUpdate = true
  }

  const input = faceInput(pose, loaded)
  if (!input) return
  entry.spineTexture.image = drawSpine(input)
  entry.spineTexture.needsUpdate = true
  entry.backTexture.image = drawBack(input)
  entry.backTexture.needsUpdate = true
}

function disposeEntry(entry: BookMaterials) {
  // Cover textures stay cached in loadCover; everything per-Book goes.
  entry.cover.dispose()
  entry.back.dispose()
  entry.spine.dispose()
  entry.spineTexture.dispose()
  entry.backTexture.dispose()
}

watch(() => props.poses, (poses) => {
  const current = new Set(poses.map(p => p.bookId))
  for (const [bookId, entry] of materialsByBook) {
    if (current.has(bookId)) continue
    disposeEntry(entry)
    materialsByBook.delete(bookId)
    motionByBook.delete(bookId)
  }
  for (const pose of poses) {
    if (!materialsByBook.has(pose.bookId)) {
      materialsFor(pose)
      applyCover(pose)
    }
  }
}, { immediate: true })

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

function onEnter(bookId: string) {
  hoveredId = bookId
  setCursor('pointer')
  if (reduced.value || pickedId.value === bookId) return
  const glint = motionFor(bookId).glint
  gsap.fromTo(glint, { value: 0 }, { value: 1, duration: 0.9, ease: 'power1.inOut', overwrite: true })
}

function onLeave(bookId: string) {
  if (hoveredId === bookId) hoveredId = null
  setCursor(dragging ? 'grabbing' : pickedId.value ? 'grab' : 'default')
}

function onClick(bookId: string, event: { stopPropagation?: () => void }) {
  event.stopPropagation?.()
  if (justDragged()) return
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

onBeforeRender(({ delta }) => {
  const cam = camera.value as PerspectiveCamera | undefined
  const ease = 1 - Math.exp(-(delta ?? 0.016) * 12)
  let glintBook: { mesh: Mesh, pose: BookPose, motion: Motion } | null = null

  for (const pose of props.poses) {
    const mesh = meshes.get(pose.bookId)
    if (!mesh) continue
    const motion = motionFor(pose.bookId)
    const isPicked = pickedId.value === pose.bookId
    const hoverTarget = hoveredId === pose.bookId && !isPicked && motion.pick.value === 0 ? 1 : 0
    motion.hover += (hoverTarget - motion.hover) * ease
    if (Math.abs(motion.hover - hoverTarget) < 0.001) motion.hover = hoverTarget

    basePosition.set(pose.x, pose.y, pose.z)
    baseQuaternion.setFromEuler(euler.set(pose.rotation[0], pose.rotation[1], pose.rotation[2]))

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
        const aside = (cam.aspect ?? 1) > 1.1 ? -halfWidth * INSPECT_ASIDE : 0
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
  pages.dispose()
  for (const entry of materialsByBook.values()) disposeEntry(entry)
  materialsByBook.clear()
})
</script>

<template>
  <TresGroup name="books">
    <TresMesh
      v-for="pose in props.poses"
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
