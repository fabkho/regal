<script setup lang="ts">
// Design round (horizontal Stack): the scene of one prototype row. The camera
// only slides along x, to where the card's native horizontal scroll puts it
// (RowCard); it renders only when something changed and only while the card
// is on screen.
import type { DirectionalLight, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, ShadowMaterial } from 'three'
import { MathUtils, Vector3 } from 'three'
import { useLoop, useTres } from '@tresjs/core'
import { FLOOR_SHADOW } from '#layers/regal/app/utils/bookcase/scene'
import { shadowFor } from '#layers/regal/app/utils/stage/quality'
import { looksKey, motionKey } from '#layers/regal/app/utils/stage/frameState'
import type { Book } from '#layers/regal/shared/types/book'
import type { RowContext } from '#layers/regal/app/prototype/row/context'
import { PILE_SHEET, STACK_SHEET } from '#layers/regal/app/prototype/row/layout'
import type { RowLayout, RowPile, RowVariant } from '#layers/regal/app/prototype/row/layout'

const props = defineProps<{
  variant: RowVariant
  layout: RowLayout
  books: Book[]
  ctx: RowContext
  hoverLook?: 'stack' | 'tip'
  riffleLook?: 'stack' | 'tip'
}>()

const { camera, scene, renderer, sizes } = useTres()
const { onBeforeRender, render } = useLoop()
const quality = useRenderQuality()

const cameraRef = shallowRef<PerspectiveCamera | null>(null)
const rig = shallowRef<Group | null>(null)
const keyLight = shallowRef<DirectionalLight | null>(null)
const floorMaterial = shallowRef<ShadowMaterial | null>(null)
const veil = shallowRef<Mesh | null>(null)
const veilForward = new Vector3()

const cam = computed(() => props.variant.camera)
/** Camera distance to the target plane for the view height asked for. */
const distance = computed(() => cam.value.viewHeight / (2 * Math.tan(MathUtils.degToRad(cam.value.fov) / 2)))

let previousX = Number.NaN

/** Start of this frame's work (this scene's callback runs before its Books'). */
let frameStart = 0

onBeforeRender(({ delta }) => {
  frameStart = performance.now()
  const seconds = delta || 0.016
  const view = props.ctx.view
  const camera3 = (cameraRef.value ?? camera.value) as PerspectiveCamera | undefined
  if (!camera3) return
  const tilt = MathUtils.degToRad(cam.value.tilt)
  const d = distance.value
  const x = view.cameraX
  view.distance = d
  // A picked Book: the camera steps back from the row (in the card), so the
  // Book can come towards it and grow, as in the Stack.
  const z = d * props.ctx.zoom.value
  camera3.position.set(x, cam.value.targetY + z * Math.sin(tilt), cam.value.targetZ + z * Math.cos(tilt))
  camera3.lookAt(x, cam.value.targetY, cam.value.targetZ)
  project(camera3)
  // The load window along x: half the view's width at the row, the scroll's speed.
  view.focusY = x
  view.targetY = x
  view.halfView = d * Math.tan(MathUtils.degToRad(cam.value.fov) / 2) * (sizes.aspectRatio.value || 1)
  const speed = Number.isNaN(previousX) ? 0 : MathUtils.clamp((x - previousX) / seconds, -3, 3)
  view.speed += (speed - view.speed) * (1 - Math.exp(-seconds * 20))
  if (Math.abs(view.speed) < 1e-4) view.speed = 0
  previousX = x
  // The shadow covers what the view shows (fewer casters in its pass than a fixed wide one).
  const light = keyLight.value
  const reach = view.halfView + 0.25
  if (light && Math.abs(light.shadow.camera.right - reach) > 0.02) {
    light.shadow.camera.left = -reach
    light.shadow.camera.right = reach
    light.shadow.camera.updateProjectionMatrix()
  }
  // A resting mouse or a finger, in world x at the row.
  const pxPerMetre = (sizes.height.value || 1) / cam.value.viewHeight
  view.pointerX = view.pointerPx === null ? null : x + (view.pointerPx - (sizes.width.value || 0) / 2) / pxPerMetre
  camera3.updateMatrixWorld()
  props.ctx.onCamera?.(camera3, sizes.width.value, sizes.height.value)
  // The lights travel with the view so every part of the row is lit the same.
  if (rig.value) rig.value.position.x = x
  if (floorMaterial.value) floorMaterial.value.opacity = FLOOR_SHADOW.opacity * (1 - props.ctx.dim.value)
  // A paper veil between the row and a picked Book: one transparent plane, no material changes.
  // The camera sees both layers (one pass) unless broken out (two, renderBrokenOut).
  if (!props.ctx.breakout.active) camera3.layers.enable(1)
  const veilMesh = veil.value
  if (veilMesh) {
    veilMesh.layers.set(1)
    const dim = props.ctx.dim.value
    veilMesh.visible = dim > 0.001
    if (veilMesh.visible) {
      // Between the row and the picked Book, wide enough for a broken-out view too.
      const at = z * 0.8
      camera3.getWorldDirection(veilForward)
      veilMesh.position.copy(camera3.position).addScaledVector(veilForward, at)
      veilMesh.quaternion.copy(camera3.quaternion)
      const h = 2 * at * Math.tan(MathUtils.degToRad(camera3.fov) / 2) * 1.1
      veilMesh.scale.set(h * Math.max(camera3.aspect, sizes.aspectRatio.value || 1) * 2, h * 2, 1)
      ;(veilMesh.material as MeshBasicMaterial).opacity = (props.ctx.inspectFull.value ? 0.9 : 0.72) * dim
    }
  }
})

/**
 * The projection. In the card: the variant's. Broken out (the canvas covers
 * the viewport while a Book is out), the camera keeps the card's view, the
 * same pixels where the card is, and its frustum widens to the rest of the
 * viewport: a virtual view centred on the card at the card's focal length,
 * of which the viewport is the window rendered (setViewOffset). The row
 * doesn't move when the canvas leaves the card or comes back.
 */
function project(camera3: PerspectiveCamera, size?: { width: number, height: number }) {
  const out = props.ctx.breakout
  const fov = cam.value.fov
  const canvas = renderer.domElement as HTMLCanvasElement
  if (!out.active) {
    if (camera3.view?.enabled || camera3.fov !== fov) {
      camera3.clearViewOffset()
      camera3.fov = fov
      camera3.aspect = (size?.width ?? canvas.clientWidth) / Math.max(1, size?.height ?? canvas.clientHeight)
      camera3.updateProjectionMatrix()
    }
    return
  }
  const width = size?.width ?? canvas.clientWidth
  const height = size?.height ?? canvas.clientHeight
  const { left, top, width: cardWidth, height: cardHeight } = out.rect
  const focal = cardHeight / 2 / Math.tan(MathUtils.degToRad(fov) / 2)
  const cx = left + cardWidth / 2
  const cy = top + cardHeight / 2
  const halfWidth = Math.max(cx, width - cx, 1)
  const halfHeight = Math.max(cy, height - cy, 1)
  camera3.fov = MathUtils.radToDeg(2 * Math.atan(halfHeight / focal))
  camera3.aspect = halfWidth / halfHeight
  camera3.setViewOffset(2 * halfWidth, 2 * halfHeight, halfWidth - cx, halfHeight - cy, width, height)
  camera3.updateProjectionMatrix()
}

// Breaking out (and back in) moves the canvas into a fixed full-viewport box
// (RowCard). Resize its drawing buffer and draw at once, in the same task, so
// no frame shows the old buffer stretched (Tres resizes a moment later too).
watch(() => props.ctx.breakout.active, () => {
  lightBothLayers()
  const canvas = renderer.domElement as HTMLCanvasElement
  const box = canvas.parentElement?.getBoundingClientRect()
  const camera3 = (cameraRef.value ?? camera.value) as PerspectiveCamera | undefined
  if (!box || !camera3 || !box.width || !box.height) return
  renderer.setSize(box.width, box.height, false)
  // Forces project() to apply the projection again.
  camera3.fov = -1
  project(camera3, box)
  if (props.ctx.breakout.active) renderBrokenOut(camera3)
  else renderer.render(scene.value, camera3)
}, { flush: 'post' })

/**
 * Broken out, the canvas covers the viewport but the row must stay inside the
 * card: the scene is drawn clipped to the card's rectangle (layer 0), then the
 * picked Book and the veil (layer 1, see RowBooks) over the whole viewport.
 */
function renderBrokenOut(camera3: PerspectiveCamera) {
  const canvas = renderer.domElement as HTMLCanvasElement
  const { left, top, width, height } = props.ctx.breakout.rect
  const autoClear = renderer.autoClear
  renderer.autoClear = false
  renderer.setScissorTest(false)
  renderer.clear()
  renderer.setScissorTest(true)
  renderer.setScissor(left, canvas.clientHeight - top - height, width, height)
  camera3.layers.set(0)
  renderer.render(scene.value, camera3)
  renderer.setScissorTest(false)
  camera3.layers.set(1)
  renderer.render(scene.value, camera3)
  camera3.layers.enable(0)
  renderer.autoClear = autoClear
}

/** Lights light both passes. */
function lightBothLayers() {
  scene.value.traverse((object) => {
    if ((object as { isLight?: boolean }).isLight) object.layers.enable(1)
  })
}

// On demand: a frame only when what it would show changed (utils/stage/frameState.ts),
// and none while the card is off screen.
let drawnMotion: number | null = null
let drawnLooks: number | null = null
render((notify) => {
  const camera3 = camera.value
  const stats = props.ctx.stats
  if (!camera3 || !props.ctx.visible.value) return
  const canvas = renderer.domElement as HTMLCanvasElement
  const motion = motionKey(scene.value, camera3, canvas.width, canvas.height)
  const looks = motion === drawnMotion ? looksKey(scene.value) : null
  if (motion === drawnMotion && looks === drawnLooks) {
    stats.loopMs.push(performance.now() - frameStart)
    if (stats.loopMs.length > 900) stats.loopMs.shift()
    return
  }
  const started = performance.now()
  if (props.ctx.breakout.active) renderBrokenOut(camera3)
  else renderer.render(scene.value, camera3)
  stats.frames++
  stats.renderMs = performance.now() - started
  // The frame's main-thread work: the Books' per-frame pass and the render calls.
  stats.loopMs.push(performance.now() - frameStart)
  if (stats.loopMs.length > 900) stats.loopMs.shift()
  stats.calls = renderer.info.render.calls
  stats.triangles = renderer.info.render.triangles
  stats.textures = renderer.info.memory.textures
  stats.geometries = renderer.info.memory.geometries
  notify()
  drawnMotion = motion
  drawnLooks = looks
})

// The dev measurements (scripts/prototype-row-measure.mjs) read the scene's textures.
onMounted(() => {
  const scenes = ((window as { __rowScenes?: unknown[] }).__rowScenes ??= [])
  scenes.push({ variant: props.variant.key, scene: scene.value, renderer })
})

watch(keyLight, (light) => {
  if (!light) return
  const { mapSize, radius } = shadowFor(quality.value, 1024, 4)
  light.shadow.mapSize.set(mapSize, mapSize)
  light.shadow.camera.near = 0.1
  light.shadow.camera.far = 6
  // Wide enough for a full-width row's view; the rig moves with the camera.
  light.shadow.camera.left = -1.1
  light.shadow.camera.right = 1.1
  light.shadow.camera.top = 0.6
  light.shadow.camera.bottom = -0.6
  light.shadow.bias = -0.0004
  light.shadow.normalBias = 0.01
  light.shadow.radius = radius
  light.shadow.blurSamples = 12
  light.target = rig.value ?? light.target
  light.shadow.camera.updateProjectionMatrix()
}, { immediate: true })

// --- Month markers in 3D (the labels are HTML, RowCard) -------------------------------

/** Where the focus line ends at either end: the end Books, or the ends of the end piles. */
const ends = computed<[number, number]>(() => {
  const poses = props.layout.poses
  if (props.layout.piles) return [props.layout.extent[0] + 0.02, props.layout.extent[1] - 0.02]
  return [poses[0]?.x ?? 0, poses.at(-1)?.x ?? 0]
})

/** Which Books show their front in the row: every one in the fan, a pile's top one, none on the Shelf. */
const pileTops = computed(() => {
  const tops = new Map<RowPile, { id: string, y: number }>()
  for (const pose of props.layout.poses) {
    const pile = props.layout.piles?.[pose.bookId]
    if (pile && (tops.get(pile)?.y ?? -1) < pose.y) tops.set(pile, { id: pose.bookId, y: pose.y })
  }
  return new Set([...tops.values()].map(top => top.id))
})
function frontShown(bookId: string): boolean {
  if (props.variant.focus === 'flow') return true
  return pileTops.value.has(bookId)
}

/**
 * Spine LOD: the Stack draws Spine art 1024 px tall; a card shows a Book a
 * couple of hundred CSS px tall. Drawn at what the card needs (× DPR, a
 * little to spare), in steps so a resize doesn't redraw.
 */
const spineScale = computed(() => {
  const pxPerMetre = (sizes.height.value || 300) / props.variant.camera.viewHeight
  const needed = 0.24 * pxPerMetre * Math.min(window.devicePixelRatio || 1, quality.value.maxDpr) * 1.2
  return [0.375, 0.5, 0.75, 1].find(step => step * 1024 >= needed) ?? 1
})

/** (a) An index card between two months; (b) a hairline ink sheet in the pile. */
const markerBoxes = computed(() => {
  if (props.variant.labels === 'tab') {
    return props.layout.markers.map(marker => ({ key: marker.key, position: [marker.x, marker.height! / 2, -0.066] as [number, number, number], scale: [0.0012, marker.height!, 0.12] as [number, number, number], color: '#E6DFD0' }))
  }
  if (props.variant.labels === 'leader') {
    // An ink sheet under each pile.
    const piles = [...new Set(Object.values(props.layout.piles ?? {}))]
    return piles.map(pile => ({ key: `${pile.left}`, position: [(pile.left + pile.right) / 2, PILE_SHEET / 2, 0] as [number, number, number], scale: [pile.right - pile.left - 0.012, PILE_SHEET, 0.145] as [number, number, number], color: '#2C2C2A' }))
  }
  if (props.variant.labels === 'stack') {
    // The Stack's 'label' sheet: narrower than the Books (its top stays hidden),
    // its front edge a hairline just in front of the Spines.
    return props.layout.markers.map(marker => ({ key: marker.key, position: [marker.x, 0.084, 0.003 - 0.085] as [number, number, number], scale: [STACK_SHEET, 0.16, 0.17] as [number, number, number], color: '#2C2C2A' }))
  }
  return []
})
</script>

<template>
  <TresPerspectiveCamera
    ref="cameraRef"
    :fov="variant.camera.fov"
    :near="0.03"
    :far="20"
    :position="[0, 0.3, 1]"
  />

  <TresHemisphereLight
    color="#FBEFDC"
    ground-color="#9A7550"
    :intensity="0.9"
  />
  <TresAmbientLight
    color="#FFE9CE"
    :intensity="0.35"
  />
  <TresGroup ref="rig">
    <TresDirectionalLight
      ref="keyLight"
      color="#FFE0B2"
      :intensity="2.2"
      :position="[-0.9, 1.4, 1.4]"
      cast-shadow
    />
    <TresDirectionalLight
      color="#FFD9AE"
      :intensity="0.6"
      :position="[1.2, 0.4, 1.8]"
    />
  </TresGroup>

  <TresMesh
    v-for="box in markerBoxes"
    :key="box.key"
    :position="box.position"
    :scale="box.scale"
    cast-shadow
    receive-shadow
  >
    <TresBoxGeometry :args="[1, 1, 1]" />
    <TresMeshStandardMaterial
      :color="box.color"
      :roughness="0.9"
    />
  </TresMesh>

  <PrototypeRowBooks
    :poses="layout.poses"
    :books="books"
    :ctx="ctx"
    :focus="variant.focus"
    :focus-at="variant.focusAt"
    :front-shown="frontShown"
    :spine-scale="spineScale"
    :piles="layout.piles"
    :ends="ends"
    :hover-look="hoverLook"
    :riffle-look="riffleLook"
  />

  <TresMesh
    ref="veil"
    name="veil"
    :visible="false"
    :render-order="10"
  >
    <TresPlaneGeometry :args="[1, 1]" />
    <TresMeshBasicMaterial
      color="#F5F2EB"
      :transparent="true"
      :opacity="0"
      :depth-write="false"
      :tone-mapped="false"
    />
  </TresMesh>

  <!-- Invisible floor that only shows the row's shadow on the paper. -->
  <TresMesh
    name="floor"
    :rotation="[-Math.PI / 2, 0, 0]"
    receive-shadow
  >
    <TresPlaneGeometry :args="[200, 4]" />
    <TresShadowMaterial
      ref="floorMaterial"
      :color="FLOOR_SHADOW.color"
      :opacity="FLOOR_SHADOW.opacity"
      :transparent="true"
    />
  </TresMesh>
</template>
