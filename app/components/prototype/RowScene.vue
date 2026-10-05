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
import { PILE_SHEET } from '#layers/regal/app/prototype/row/layout'
import type { RowLayout, RowPile, RowVariant } from '#layers/regal/app/prototype/row/layout'

const props = defineProps<{
  variant: RowVariant
  layout: RowLayout
  books: Book[]
  ctx: RowContext
}>()

const { camera, scene, renderer, sizes } = useTres()
const { onBeforeRender, render } = useLoop()
const quality = useRenderQuality()

const cameraRef = shallowRef<PerspectiveCamera | null>(null)
const rig = shallowRef<Group | null>(null)
const keyLight = shallowRef<DirectionalLight | null>(null)
const floorMaterial = shallowRef<ShadowMaterial | null>(null)
const veil = shallowRef<Mesh | null>(null)
const backdrop = shallowRef<Mesh | null>(null)
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
  camera3.position.set(x, cam.value.targetY + d * Math.sin(tilt), cam.value.targetZ + d * Math.cos(tilt))
  camera3.lookAt(x, cam.value.targetY, cam.value.targetZ)
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
  const veilMesh = veil.value
  if (veilMesh) {
    const dim = props.ctx.dim.value
    veilMesh.visible = dim > 0.001
    if (veilMesh.visible) {
      const at = d * 0.72
      camera3.getWorldDirection(veilForward)
      veilMesh.position.copy(camera3.position).addScaledVector(veilForward, at)
      veilMesh.quaternion.copy(camera3.quaternion)
      const h = 2 * at * Math.tan(MathUtils.degToRad(cam.value.fov) / 2) * 1.05
      veilMesh.scale.set(h * (sizes.aspectRatio.value || 1), h, 1)
      ;(veilMesh.material as MeshBasicMaterial).opacity = 0.84 * dim
    }
  }
  // The canvas is transparent, and a coloured veil only blends right over
  // opaque pixels: paper behind everything while the veil is up.
  if (backdrop.value) {
    backdrop.value.visible = props.ctx.dim.value > 0.001
    backdrop.value.position.set(x, cam.value.targetY, cam.value.targetZ - 3)
  }
})

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
  renderer.render(scene.value, camera3)
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
  />

  <TresMesh
    ref="backdrop"
    name="backdrop"
    :visible="false"
  >
    <TresPlaneGeometry :args="[40, 40]" />
    <TresMeshBasicMaterial
      color="#F5F2EB"
      :tone-mapped="false"
    />
  </TresMesh>
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
