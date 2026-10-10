<script setup lang="ts">
// The scene of RegalBooksDeal: camera, the Stack's lights, a floor that only
// shows the shadow, the wheel's pointer, and the clock. The plan
// (utils/deal/plan.ts) says where every Book and the camera are at any ms;
// here each frame samples it, moves the meshes and draws a frame only when
// something changed (the frame gate), so the held end costs nothing.
// Phases: loading (covers in, faces drawn, textures uploaded) → playing →
// done; `skip` settles to the end in 180 ms. Emits `ready` after the first
// frame is drawn (the motion starts then) and `picked` at the end.
import { Color } from 'three'
import type { DirectionalLight, Mesh, MeshBasicMaterial, PerspectiveCamera, ShadowMaterial } from 'three'
import { useLoop, useTres } from '@tresjs/core'
import { FLOOR_SHADOW } from '#layers/regal/app/utils/bookcase/scene'
import { shadowFor } from '#layers/regal/app/utils/stage/quality'
import { looksKey, motionKey } from '#layers/regal/app/utils/stage/frameState'
import { createFrameGate } from '#layers/regal/app/utils/stage/frameGate'
import { markRegal } from '#layers/regal/app/utils/stage/marks'
import type { DealAssets } from '#layers/regal/app/utils/deal/assets'
import { dealDims } from '#layers/regal/app/utils/deal/book'
import type { DealBook, DealPicked, DealVariant } from '#layers/regal/app/utils/deal/book'
import { cameraFrame, DEAL_FOV, planDeal, sampleCamera, sampleDeal, winnerRect } from '#layers/regal/app/utils/deal/plan'
import type { DealCamera, DealPlan } from '#layers/regal/app/utils/deal/plan'
import { ease, lerp, qSlerp } from '#layers/regal/app/utils/deal/math'
import { makePose } from '#layers/regal/app/utils/deal/tracks'
import type { DealPose } from '#layers/regal/app/utils/deal/tracks'

const props = defineProps<{
  books: DealBook[]
  winner: number
  variant: DealVariant
  duration: number
  reduced: boolean
  seed?: number
}>()
const emit = defineEmits<{
  ready: []
  picked: [DealPicked]
}>()

/** The settle of a skip (ms). */
const SKIP_MS = 180

const { camera, scene, renderer, sizes } = useTres()
const { render } = useLoop()
const quality = useRenderQuality()
const ui = useRegalUi()

const cameraRef = shallowRef<PerspectiveCamera | null>(null)
const keyLight = shallowRef<DirectionalLight | null>(null)
const floor = shallowRef<Mesh | null>(null)
const floorMaterial = shallowRef<ShadowMaterial | null>(null)
const pointer = shallowRef<Mesh | null>(null)
const pointerMaterial = shallowRef<MeshBasicMaterial | null>(null)
const booksRef = ref<{ prepare: () => Promise<DealAssets | null>, apply: (index: number, pose: DealPose) => void, showAll: () => void } | null>(null)

const dims = props.books.map(dealDims)
// Only the look varies with the seed (the riffle's order, wobbles): the winner is the host's.
const seed = props.seed ?? Math.floor(Math.random() * 0x100000000)
const accent = computed(() => ui.tokens.value['--_regal-accent'] || '#B93E2E')

const shadowsOn = () => renderer.shadowMap.enabled
let planAspect = 1.6
let plan: DealPlan = makePlan(planAspect)
function makePlan(aspect: number): DealPlan {
  planAspect = aspect
  return planDeal({ books: dims, winner: props.winner, variant: props.variant, duration: props.duration, seed, aspect, reducedMotion: props.reduced })
}
const roundAspect = (value: number) => Math.round(value * 50) / 50

type Phase = 'loading' | 'ready' | 'playing' | 'skipping' | 'done'
let phase: Phase = 'loading'
let startedAt = 0
let skipAt = 0
let skipWanted = false
let firstFrame = true

const pose = makePose()
const target = makePose()
const snapshots = props.books.map(() => makePose())
const snapshotCamera: DealCamera = { tilt: 0, targetY: 0, targetZ: 0, distance: 1 }
const endCamera: DealCamera = { tilt: 0, targetY: 0, targetZ: 0, distance: 1 }
const live: DealCamera = { tilt: 0, targetY: 0, targetZ: 0, distance: 1 }
let snapshotFloor = 0
let snapshotPointer = 0

const gate = createFrameGate(renderer)
onBeforeUnmount(() => gate.dispose())

const isDone = () => phase === 'done'

/** The rest of the work before the first frame: every texture uploaded, every shader compiled. */
async function prepare() {
  const assets = await booksRef.value?.prepare()
  if (!assets || phase === 'done') return
  const cam = (cameraRef.value ?? camera.value) as PerspectiveCamera | undefined
  for (const texture of assets.textures) renderer.initTexture(texture)
  if (cam) {
    booksRef.value?.showAll()
    if (pointer.value) pointer.value.visible = true
    if (floor.value) floor.value.visible = true
    // Linked off the main thread where the browser can (KHR_parallel_shader_compile); resolves once they are.
    await renderer.compileAsync(scene.value, cam)
    await warmUp(cam)
  }
  if (isDone()) return
  phase = 'ready'
}

/**
 * Resolves once the GPU has run everything queued so far (a fence, polled, so the main thread is never
 * blocked: `finish()` does not wait in Chrome). Gives up after 3 s.
 */
async function gpuIdle() {
  const gl = renderer.getContext() as WebGL2RenderingContext
  if (typeof gl.fenceSync !== 'function') return
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
  if (!fence) return
  gl.flush()
  const until = performance.now() + 3000
  while (performance.now() < until) {
    const state = gl.clientWaitSync(fence, 0, 0)
    if (state === gl.ALREADY_SIGNALED || state === gl.CONDITION_SATISFIED || state === gl.WAIT_FAILED) break
    await new Promise(resolve => setTimeout(resolve, 16))
  }
  gl.deleteSync(fence)
}

/**
 * One real frame with everything showing (the Books at their fan, casting
 * shadows, the floor and the pointer in): compile() builds the Books' shaders
 * but not the shadow pass's depth/VSM programs, the shadow map's targets or
 * the first draw of each visible object, which would otherwise land in the
 * first frames of the motion. Waited for on the GPU and wiped, so none of it
 * shows and the clock starts on a warm renderer.
 */
async function warmUp(cam: PerspectiveCamera) {
  const size = stageSize()
  if (!size.width || !size.height) return
  const aspect = roundAspect(size.width / size.height)
  if (Math.abs(aspect - planAspect) > 0.001) plan = makePlan(aspect)
  for (let book = 0; book < dims.length; book++) {
    sampleDeal(plan, book, plan.timeline.introEnd, pose)
    booksRef.value?.apply(book, pose)
  }
  sampleCamera(plan, 0, live)
  applyEffects(1, 1)
  applyCamera(cam, live, size)
  // Shown to the browser too, twice: first at a whisper of canvas opacity with everything in (shadow
  // casters included), then at full canvas opacity with the Books all but transparent, so both ways the
  // compositor draws this canvas have been used before the motion's first frames.
  const canvas = renderer.domElement as HTMLCanvasElement
  const before = canvas.style.opacity
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))
  canvas.style.opacity = '0.01'
  renderer.render(scene.value, cam)
  await nextFrame()
  canvas.style.opacity = before
  for (let book = 0; book < dims.length; book++) {
    sampleDeal(plan, book, plan.timeline.introEnd, pose)
    pose.opacity = 0.02
    booksRef.value?.apply(book, pose)
  }
  applyEffects(0.02, 0.02)
  renderer.render(scene.value, cam)
  await nextFrame()
  renderer.clear()
  await nextFrame()
  await gpuIdle()
  gate.invalidate()
}
onMounted(prepare)

/** Pixels the stage is drawn at. */
function stageSize() {
  const canvas = renderer.domElement as HTMLCanvasElement
  return { width: canvas.clientWidth || sizes.width.value, height: canvas.clientHeight || sizes.height.value }
}

function applyCamera(cam: PerspectiveCamera, state: DealCamera, size: { width: number, height: number }) {
  const { eye, target: look } = cameraFrame(state)
  cam.position.set(eye[0], eye[1], eye[2])
  cam.lookAt(look[0], look[1], look[2])
  const aspect = size.width / Math.max(1, size.height)
  if (cam.fov !== DEAL_FOV || Math.abs(cam.aspect - aspect) > 1e-6) {
    cam.fov = DEAL_FOV
    cam.aspect = aspect
    cam.updateProjectionMatrix()
  }
}

function blend(from: DealPose, to: DealPose, e: number, out: DealPose) {
  out.position[0] = lerp(from.position[0], to.position[0], e)
  out.position[1] = lerp(from.position[1], to.position[1], e)
  out.position[2] = lerp(from.position[2], to.position[2], e)
  qSlerp(from.quaternion, to.quaternion, e, out.quaternion)
  out.scale = lerp(from.scale, to.scale, e)
  out.thickness = lerp(from.thickness, to.thickness, e)
  out.opacity = lerp(from.opacity, to.opacity, e)
}

function beginSkip(t: number, now: number) {
  for (let book = 0; book < dims.length; book++) sampleDeal(plan, book, t, snapshots[book]!)
  sampleCamera(plan, t, snapshotCamera)
  snapshotFloor = plan.floor?.opacity(t) ?? 0
  snapshotPointer = plan.pointer?.opacity(t) ?? 0
  phase = 'skipping'
  skipAt = now
  skipWanted = false
}

function skip() {
  if (phase === 'done' || phase === 'skipping') return
  skipWanted = true
}

function finish() {
  phase = 'done'
  markRegal('deal:end')
  const canvas = renderer.domElement as HTMLCanvasElement
  const box = canvas.getBoundingClientRect()
  const size = stageSize()
  const local = winnerRect(plan, size)
  emit('picked', {
    index: props.winner,
    id: props.books[props.winner]!.id,
    rect: { left: box.left + local.left, top: box.top + local.top, width: local.width, height: local.height },
  })
}

render((notify) => {
  const cam = (cameraRef.value ?? camera.value) as PerspectiveCamera | undefined
  if (!cam || phase === 'loading') return
  const size = stageSize()
  if (!size.width || !size.height) return
  const aspect = roundAspect(size.width / size.height)
  if (Math.abs(aspect - planAspect) > 0.001) plan = makePlan(aspect)
  const now = performance.now()

  let t = 0
  let last = false
  if (phase === 'playing' && skipWanted) beginSkip(Math.min(now - startedAt, plan.total), now)
  if (phase === 'skipping') {
    const raw = (now - skipAt) / SKIP_MS
    const e = ease('inOut', raw)
    for (let book = 0; book < dims.length; book++) {
      sampleDeal(plan, book, plan.total, target)
      blend(snapshots[book]!, target, e, pose)
      booksRef.value?.apply(book, pose)
    }
    sampleCamera(plan, plan.total, endCamera)
    live.tilt = lerp(snapshotCamera.tilt, endCamera.tilt, e)
    live.targetY = lerp(snapshotCamera.targetY, endCamera.targetY, e)
    live.targetZ = lerp(snapshotCamera.targetZ, endCamera.targetZ, e)
    live.distance = lerp(snapshotCamera.distance, endCamera.distance, e)
    applyEffects(lerp(snapshotFloor, plan.floor?.opacity(plan.total) ?? 0, e), lerp(snapshotPointer, plan.pointer?.opacity(plan.total) ?? 0, e))
    last = raw >= 1
  }
  else {
    if (phase === 'ready') t = 0
    else if (phase === 'done') t = plan.total
    else t = Math.min(now - startedAt, plan.total)
    for (let book = 0; book < dims.length; book++) {
      sampleDeal(plan, book, t, pose)
      booksRef.value?.apply(book, pose)
    }
    sampleCamera(plan, t, live)
    applyEffects(plan.floor?.opacity(t) ?? 0, plan.pointer?.opacity(t) ?? 0)
    last = phase === 'playing' && t >= plan.total
  }
  applyCamera(cam, live, size)

  if (gate.due(motionKey(scene.value, cam, size.width, size.height), () => looksKey(scene.value))) {
    renderer.render(scene.value, cam)
    notify()
    gate.drawn()
  }

  if (phase === 'ready') {
    // The first frame is drawn: the motion starts now.
    phase = 'playing'
    startedAt = performance.now()
    markRegal('deal:start')
    if (firstFrame) {
      firstFrame = false
      emit('ready')
    }
  }
  else if (last) {
    finish()
  }
})

/** Floor shadow and pointer: opacity (and what shows) by the plan. */
function applyEffects(floorOpacity: number, pointerOpacity: number) {
  const ground = floor.value
  if (ground) {
    const show = plan.floor !== null && shadowsOn() && floorOpacity > 0.01
    ground.visible = show
    if (show) ground.position.y = plan.floor!.y
    if (floorMaterial.value) floorMaterial.value.opacity = FLOOR_SHADOW.opacity * floorOpacity
  }
  const marker = pointer.value
  if (marker) {
    const show = plan.pointer !== null && pointerOpacity > 0.01
    marker.visible = show
    if (show) {
      marker.position.set(plan.pointer!.position[0], plan.pointer!.position[1] + 0.013, plan.pointer!.position[2])
      if (pointerMaterial.value) pointerMaterial.value.opacity = pointerOpacity
    }
  }
}

watch(keyLight, (light) => {
  if (!light) return
  const { mapSize, radius } = shadowFor(quality.value, 1024, 4)
  light.shadow.mapSize.set(mapSize, mapSize)
  light.shadow.camera.near = 0.1
  light.shadow.camera.far = 6
  light.shadow.camera.left = -0.7
  light.shadow.camera.right = 0.7
  light.shadow.camera.top = 0.7
  light.shadow.camera.bottom = -0.7
  light.shadow.bias = -0.0004
  light.shadow.normalBias = 0.01
  light.shadow.radius = radius
  light.shadow.blurSamples = 12
  light.shadow.camera.updateProjectionMatrix()
}, { immediate: true })

const accentColor = computed(() => new Color().set(accent.value))

defineExpose({ skip })
</script>

<template>
  <TresPerspectiveCamera
    ref="cameraRef"
    :fov="DEAL_FOV"
    :near="0.05"
    :far="8"
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

  <DealBooks
    ref="booksRef"
    :books="books"
    :dims="dims"
    :variant="variant"
    :winner="winner"
  />

  <TresMesh
    ref="pointer"
    name="pointer"
    :visible="false"
    :rotation="[Math.PI, 0, 0]"
  >
    <TresConeGeometry :args="[0.01, 0.026, 3]" />
    <TresMeshBasicMaterial
      ref="pointerMaterial"
      :color="accentColor"
      :transparent="true"
      :opacity="0"
      :tone-mapped="false"
    />
  </TresMesh>

  <!-- Invisible floor that only shows the shadow of the Books. -->
  <TresMesh
    ref="floor"
    name="floor"
    :visible="false"
    :rotation="[-Math.PI / 2, 0, 0]"
    receive-shadow
  >
    <TresPlaneGeometry :args="[3, 3]" />
    <TresShadowMaterial
      ref="floorMaterial"
      :color="FLOOR_SHADOW.color"
      :opacity="FLOOR_SHADOW.opacity"
      :transparent="true"
      :depth-write="false"
    />
  </TresMesh>
</template>
