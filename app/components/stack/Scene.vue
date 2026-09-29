<script setup lang="ts">
// The Stack view: the whole Library as one pile of Books, no Bookcase. The
// camera looks slightly down at the pile; the wheel, dragging and the arrow
// keys scroll smoothly up and down it. Scrolling pauses while a Book is out.
import type { DirectionalLight, Group, PerspectiveCamera } from 'three'
import { useLoop, useTres } from '@tresjs/core'
import { MathUtils } from 'three'
import { markDragEnd } from '~/utils/books/dragGuard'
import { FLOOR_SHADOW } from '~/utils/bookcase/scene'

const props = defineProps<{ stackHeight: number }>()
const emit = defineEmits<{ ready: [] }>()

/** Camera distance from the pile and how far above the viewed point it sits. */
const CAMERA_DISTANCE = 1.15
const CAMERA_RISE = 0.22
const CAMERA_FOV = 34
/** Metres scrolled per wheel pixel / per dragged pixel. */
const WHEEL_SPEED = 0.0011
const DRAG_SPEED = 0.0022
const KEY_STEP = 0.12

const { camera, renderer } = useTres()
const { onBeforeRender } = useLoop()
const { pickedId } = useBookPick()
const reducedMotion = usePreferredReducedMotion()

const cameraRef = shallowRef<PerspectiveCamera | null>(null)
const rig = shallowRef<Group | null>(null)
const keyLight = shallowRef<DirectionalLight | null>(null)

/** The height the camera looks at, and where it is easing to. */
const view = { y: 0.2, target: 0.2 }
const bounds = computed<[number, number]>(() => [0.1, Math.max(0.1, props.stackHeight - 0.06)])
let placed = false

watch(() => props.stackHeight, (height) => {
  const top = MathUtils.clamp(height - 0.1, ...bounds.value)
  // Start at the top of the pile (what you're reading now); keep position on later changes.
  if (!placed || view.target > bounds.value[1]) {
    view.target = top
    view.y = top
    placed = height > 0
  }
}, { immediate: true })

function scrollBy(metres: number) {
  if (pickedId.value) return
  view.target = MathUtils.clamp(view.target + metres, ...bounds.value)
}

function onWheel(event: WheelEvent) {
  if (pickedId.value) return
  event.preventDefault()
  scrollBy(-event.deltaY * WHEEL_SPEED)
}

let dragging = false
let dragMoved = false
let lastY = 0

function onPointerDown(event: PointerEvent) {
  if (pickedId.value) return
  dragging = true
  dragMoved = false
  lastY = event.clientY
}

function onPointerMove(event: PointerEvent) {
  if (!dragging) return
  const dy = event.clientY - lastY
  lastY = event.clientY
  if (Math.abs(dy) > 0) dragMoved = true
  scrollBy(dy * DRAG_SPEED)
}

function onPointerUp() {
  if (dragging && dragMoved) markDragEnd()
  dragging = false
}

function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return
  const steps: Record<string, number> = {
    ArrowUp: KEY_STEP,
    ArrowDown: -KEY_STEP,
    PageUp: KEY_STEP * 4,
    PageDown: -KEY_STEP * 4,
  }
  if (event.key in steps) {
    event.preventDefault()
    scrollBy(steps[event.key]!)
  }
  else if (event.key === 'Home') {
    view.target = bounds.value[1]
  }
  else if (event.key === 'End') {
    view.target = bounds.value[0]
  }
}

watch(keyLight, (light) => {
  if (!light) return
  light.shadow.mapSize.set(2048, 2048)
  light.shadow.camera.near = 0.1
  light.shadow.camera.far = 8
  light.shadow.camera.left = -0.8
  light.shadow.camera.right = 0.8
  light.shadow.camera.top = 0.9
  light.shadow.camera.bottom = -0.9
  light.shadow.bias = -0.0004
  light.shadow.normalBias = 0.01
  light.shadow.radius = 6
  light.shadow.blurSamples = 16
  light.target = rig.value ?? light.target
  light.shadow.camera.updateProjectionMatrix()
}, { immediate: true })

onMounted(() => {
  const element = renderer.domElement as HTMLElement
  element.addEventListener('wheel', onWheel, { passive: false })
  element.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('keydown', onKey)
  emit('ready')
})

onBeforeUnmount(() => {
  const element = renderer.domElement as HTMLElement | undefined
  element?.removeEventListener('wheel', onWheel)
  element?.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('keydown', onKey)
})

onBeforeRender(({ delta }) => {
  const smoothing = reducedMotion.value === 'reduce' ? 1 : 1 - Math.exp(-(delta ?? 0.016) * 7)
  view.y += (view.target - view.y) * smoothing
  const cam = (cameraRef.value ?? camera.value) as PerspectiveCamera | undefined
  if (cam) {
    cam.position.set(0, view.y + CAMERA_RISE, CAMERA_DISTANCE)
    cam.lookAt(0, view.y, 0)
  }
  // Lights travel with the view so every part of the pile is lit the same.
  if (rig.value) rig.value.position.y = view.y
})
</script>

<template>
  <TresPerspectiveCamera
    ref="cameraRef"
    :fov="CAMERA_FOV"
    :near="0.05"
    :far="30"
    :position="[0, 0.4, CAMERA_DISTANCE]"
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
      :position="[-1.1, 1.4, 1.6]"
      cast-shadow
    />
    <TresDirectionalLight
      color="#FFD9AE"
      :intensity="0.6"
      :position="[1.4, 0.3, 1.8]"
    />
  </TresGroup>

  <slot />

  <!-- Invisible floor that only shows the pile's shadow on the paper. -->
  <TresMesh
    name="floor"
    :rotation="[-Math.PI / 2, 0, 0]"
    receive-shadow
  >
    <TresPlaneGeometry :args="[6, 6]" />
    <TresShadowMaterial
      :color="FLOOR_SHADOW.color"
      :opacity="FLOOR_SHADOW.opacity"
      :transparent="true"
    />
  </TresMesh>
</template>
