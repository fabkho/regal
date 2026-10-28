<script setup lang="ts">
// The scene of a Reel (RegalBooksReel): the prototype's CSS 3D stage as a
// camera (utils/reel/scene.ts: 900 px in front, its axis 40 % down the
// stage), soft lights (lighter and more even than the row's: the prototype's covers show their own colours), the Books on their arc (ReelBooks) and the
// veil behind a Book taken out. Broken out (the canvas over the viewport while
// a Book is out) it keeps the card's view where the card is and draws the arc
// clipped to it, the Book taken out and the veil over everything (as the
// row's RowScene). It renders only when something on screen changed
// (utils/stage/frameGate.ts) and nothing while the reel is off screen.
import type { DirectionalLight, Group, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three'
import { MathUtils, Vector3 } from 'three'
import { useLoop, useTres } from '@tresjs/core'
import { looksKey, motionKey } from '#layers/regal/app/utils/stage/frameState'
import { createFrameGate } from '#layers/regal/app/utils/stage/frameGate'
import { markRegal } from '#layers/regal/app/utils/stage/marks'
import type { Book } from '#layers/regal/shared/types/book'
import type { ReelContext } from '#layers/regal/app/utils/reel/context'
import { REEL_AXIS_Y, REEL_PERSPECTIVE, REEL_PX, reelWindow } from '#layers/regal/app/utils/reel/scene'
import type { ReelWindow } from '#layers/regal/app/utils/reel/scene'

const props = defineProps<{
  books: Book[]
  ctx: ReelContext
}>()

const { camera, scene, renderer } = useTres()
const { onBeforeRender, render } = useLoop()

const cameraRef = shallowRef<PerspectiveCamera | null>(null)
const keyLight = shallowRef<DirectionalLight | null>(null)
const rig = shallowRef<Group | null>(null)
const veil = shallowRef<Mesh | null>(null)
const veilForward = new Vector3()
let veilColor = ''
/** How far in front of the camera the veil hangs (m): behind a Book taken out, in front of the arc. */
const VEIL_DISTANCE = 0.62
markRegal('reel:tres')

// The state machine runs first (ReelCard's tick), then the Books read where the arc is.
onBeforeRender(({ delta }) => {
  props.ctx.tick(Math.min(100, (delta ?? 0.016) * 1000), performance.now())
  const camera3 = (cameraRef.value ?? camera.value) as PerspectiveCamera | undefined
  if (!camera3) return
  // `perspective-origin: 50% 40%`: the camera's axis 10 % of the stage above its middle.
  camera3.position.set(0, (0.5 - REEL_AXIS_Y) * props.ctx.stageHeight.value * REEL_PX, REEL_PERSPECTIVE * REEL_PX)
  camera3.rotation.set(0, 0, 0)
  project(camera3)
  camera3.updateMatrixWorld()
  if (!props.ctx.breakout.active) camera3.layers.enable(1)
  // A veil between the arc and a Book taken out (the page's colour): one transparent plane on layer 1.
  const veilMesh = veil.value
  if (veilMesh) {
    veilMesh.layers.set(1)
    const dim = props.ctx.dim.value
    veilMesh.visible = dim > 0.001
    if (veilMesh.visible) {
      camera3.getWorldDirection(veilForward)
      veilMesh.position.copy(camera3.position).addScaledVector(veilForward, VEIL_DISTANCE)
      veilMesh.quaternion.copy(camera3.quaternion)
      // Over the whole view the camera's window belongs to (the viewport broken out).
      const half = VEIL_DISTANCE * Math.tan(MathUtils.degToRad(camera3.fov) / 2) * 1.1
      veilMesh.scale.set(2 * half * Math.max(1, camera3.aspect), 2 * half, 1)
      const material = veilMesh.material as MeshBasicMaterial
      material.opacity = props.ctx.veil.opacity * dim
      if (veilColor !== props.ctx.veil.color) {
        veilColor = props.ctx.veil.color
        material.color.set(veilColor)
      }
    }
  }
})

/**
 * The projection (utils/reel/scene.ts `reelWindow`). In the card: the stage's
 * own window. Broken out: the viewport, the axis where it is in the card, so
 * the arc doesn't move when the canvas leaves the card or comes back.
 */
const frameWindow: ReelWindow = reelWindow(1, 1, 0, 0)
function project(camera3: PerspectiveCamera, size?: { width: number, height: number }) {
  const canvas = renderer.domElement as HTMLCanvasElement
  const width = size?.width ?? canvas.clientWidth
  const height = size?.height ?? canvas.clientHeight
  const out = props.ctx.breakout
  const axisX = out.active ? out.rect.left + out.rect.width / 2 : width / 2
  const axisY = out.active ? out.rect.top + out.rect.height * REEL_AXIS_Y : height * REEL_AXIS_Y
  // Every frame (Tres sets the aspect on a resize): a few numbers.
  const view = reelWindow(width, height, axisX, axisY, REEL_PERSPECTIVE, frameWindow)
  camera3.fov = view.fov
  camera3.aspect = view.aspect
  camera3.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height)
  camera3.updateProjectionMatrix()
}

/** Lights light both passes (the arc's and the Book taken out's). */
function lightBothLayers() {
  scene.value.traverse((object) => {
    if ((object as { isLight?: boolean }).isLight) object.layers.enable(1)
  })
}

// Breaking out (and back in) moves the canvas into a fixed box over the
// viewport (ReelCard): resize its drawing buffer and draw at once, in the same
// task, so no frame shows the old buffer stretched.
watch(() => props.ctx.breakout.active, () => {
  lightBothLayers()
  const canvas = renderer.domElement as HTMLCanvasElement
  const box = canvas.parentElement?.getBoundingClientRect()
  const camera3 = (cameraRef.value ?? camera.value) as PerspectiveCamera | undefined
  if (!box || !camera3 || !box.width || !box.height) return
  renderer.setSize(box.width, box.height, false)
  project(camera3, box)
  camera3.updateMatrixWorld()
  if (props.ctx.breakout.active) renderBrokenOut(camera3)
  else renderer.render(scene.value, camera3)
}, { flush: 'post' })

/**
 * Broken out the canvas covers the viewport but the arc stays in the card: it
 * is drawn clipped to the card's box (layer 0), then the Book taken out and the
 * veil over the whole viewport (layer 1, see ReelBooks).
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

// On demand: a frame only when what it would show changed, none off screen.
const gate = createFrameGate(renderer)
let firstFrame = true
let readySent = false
render((notify) => {
  const camera3 = camera.value
  if (!camera3 || !props.ctx.visible.value) return
  const canvas = renderer.domElement as HTMLCanvasElement
  if (!gate.due(motionKey(scene.value, camera3, canvas.width, canvas.height), () => looksKey(scene.value, camera3))) return
  if (props.ctx.breakout.active) renderBrokenOut(camera3 as PerspectiveCamera)
  else renderer.render(scene.value, camera3)
  if (firstFrame) {
    firstFrame = false
    markRegal('reel:first-frame')
  }
  if (!readySent && props.ctx.facesReady.value) {
    readySent = true
    markRegal('reel:ready')
    props.ctx.ready()
  }
  notify()
  gate.drawn()
})
// Off screen nothing is drawn; back on screen, what shows may be stale.
watch(props.ctx.visible, (visible) => {
  if (visible) gate.invalidate()
})
onBeforeUnmount(() => gate.dispose())

onMounted(lightBothLayers)
</script>

<template>
  <TresPerspectiveCamera
    ref="cameraRef"
    :fov="20"
    :near="0.02"
    :far="6"
    :position="[0, 0, 0.9]"
  />

  <TresHemisphereLight
    color="#FFF8EE"
    ground-color="#A08A70"
    :intensity="1.2"
  />
  <TresAmbientLight
    color="#FFFFFF"
    :intensity="1.05"
  />
  <TresGroup ref="rig">
    <TresDirectionalLight
      ref="keyLight"
      color="#FFF1DE"
      :intensity="1.5"
      :position="[-0.9, 1.4, 1.4]"
    />
    <TresDirectionalLight
      color="#FFF1DE"
      :intensity="0.6"
      :position="[1.2, 0.4, 1.8]"
    />
  </TresGroup>

  <ReelBooks
    :books="books"
    :ctx="ctx"
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
</template>
