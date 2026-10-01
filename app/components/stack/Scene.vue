<script setup lang="ts">
// The Stack view: the whole Library as one pile of Books, no Bookcase. The
// camera looks slightly down at the pile; the wheel, dragging and the arrow
// keys scroll smoothly up and down it (a flicked finger glides on). Scrolling
// pauses while a Book is out. The scroll goes to the Books' scroll highlight.
import type { DirectionalLight, Group, PerspectiveCamera } from 'three'
import { useLoop, useTres } from '@tresjs/core'
import { MathUtils } from 'three'
import { FLOOR_SHADOW } from '#layers/regal/app/utils/bookcase/scene'
import { STACK_SCROLL } from '#layers/regal/app/utils/stack/scrollHighlight'
import type { StackScroll } from '#layers/regal/app/utils/stack/scrollHighlight'

const props = defineProps<{
  stackHeight: number
  /** Width (metres) the view must fit; wider when dates stand beside the pile. */
  fitWidth?: number
}>()
const emit = defineEmits<{ ready: [] }>()

/** Camera distance from the pile and how far above the viewed point it sits. */
const CAMERA_DISTANCE = 1.15
const CAMERA_RISE = 0.22
const CAMERA_FOV = 34
/** Width the pile needs on screen: the longest Books plus their offsets, bookmarks and a margin. */
const FIT_WIDTH = 0.42
/** Metres scrolled per wheel pixel / per dragged pixel. */
const WHEEL_SPEED = 0.0011
const DRAG_SPEED = 0.0022
const KEY_STEP = 0.12
/** A flicked touch drag carries on this long (s) at its last speed. */
const FLING_SECONDS = 0.3
/** A touch lifted longer than this (ms) after its last move was held still: no fling. */
const FLING_WINDOW = 80
/** The focus line meets the Spines about this far in front of the pile's axis (half a Book's depth). */
const FOCUS_Z = 0.07

const { camera, renderer } = useTres()
const { onBeforeRender } = useLoop()
const { pickedId } = useBookPick()
const { scrolled } = useScrollLead()
const reducedMotion = usePreferredReducedMotion()

const cameraRef = shallowRef<PerspectiveCamera | null>(null)
const rig = shallowRef<Group | null>(null)
const keyLight = shallowRef<DirectionalLight | null>(null)

/** The height the camera looks at, and where it is easing to. */
const view = { y: 0.2, target: 0.2 }
const bounds = computed<[number, number]>(() => [0.1, Math.max(0.1, props.stackHeight - 0.06)])
let placed = false

/** The scroll for the Books' scroll highlight (utils/stack/scrollHighlight.ts), updated every frame. */
const scroll: StackScroll = { focusY: view.y, speed: 0 }
let previousY = view.y
provide(STACK_SCROLL, scroll)

watch(() => props.stackHeight, (height) => {
  const top = MathUtils.clamp(height - 0.1, ...bounds.value)
  // Start at the top of the pile (what you're reading now); keep position on later changes.
  if (!placed || view.target > bounds.value[1]) {
    view.target = top
    view.y = top
    previousY = top
    placed = height > 0
  }
}, { immediate: true })

function scrollBy(metres: number) {
  if (pickedId.value) return
  scrolled()
  view.target = MathUtils.clamp(view.target + metres, ...bounds.value)
}

function onWheel(event: WheelEvent) {
  if (pickedId.value) return
  event.preventDefault()
  scrollBy(-event.deltaY * WHEEL_SPEED)
}

let dragging = false
let lastY = 0
/** Speed (m/s) of a touch drag and when it last moved, for the fling. */
let dragSpeed = 0
let lastMoveAt = 0

function onPointerDown(event: PointerEvent) {
  if (pickedId.value) return
  // Touch has no hover: the scroll focus leads.
  if (event.pointerType !== 'mouse') scrolled()
  dragging = true
  lastY = event.clientY
  dragSpeed = 0
  lastMoveAt = event.timeStamp
}

function onPointerMove(event: PointerEvent) {
  // A release outside the window never reaches us: no button down, no drag.
  if (dragging && !(event.buttons & 1)) dragging = false
  if (!dragging) return
  const dy = event.clientY - lastY
  lastY = event.clientY
  if (dy === 0) return
  const seconds = (event.timeStamp - lastMoveAt) / 1000
  if (seconds > 0) dragSpeed += (dy * DRAG_SPEED / seconds - dragSpeed) * 0.6
  lastMoveAt = event.timeStamp
  scrollBy(dy * DRAG_SPEED)
}

function onPointerUp(event: PointerEvent) {
  // A flicked finger lets the pile glide on (a mouse drag stops where it is let go).
  const flicked = dragging && event.type === 'pointerup' && event.pointerType !== 'mouse'
    && event.timeStamp - lastMoveAt < FLING_WINDOW
  dragging = false
  if (flicked) scrollBy(dragSpeed * FLING_SECONDS)
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
    scrolled()
    view.target = bounds.value[1]
  }
  else if (event.key === 'End') {
    scrolled()
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
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('keydown', onKey)
  emit('ready')
})

onBeforeUnmount(() => {
  const element = renderer.domElement as HTMLElement | undefined
  element?.removeEventListener('wheel', onWheel)
  element?.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('keydown', onKey)
})

onBeforeRender(({ delta }) => {
  const seconds = delta || 0.016
  const smoothing = reducedMotion.value === 'reduce' ? 1 : 1 - Math.exp(-seconds * 7)
  view.y += (view.target - view.y) * smoothing
  // Smoothed, and a jump (a new pile, reduced motion) counts no faster than 3 m/s.
  const speed = MathUtils.clamp((view.y - previousY) / seconds, -3, 3)
  scroll.speed += (speed - scroll.speed) * (1 - Math.exp(-seconds * 20))
  if (Math.abs(scroll.speed) < 1e-4) scroll.speed = 0
  previousY = view.y
  scroll.focusY = view.y
  const cam = (cameraRef.value ?? camera.value) as PerspectiveCamera | undefined
  if (cam) {
    // Narrow views (a portfolio sidebar) step back until the pile fits the width.
    const halfWidth = Math.tan(MathUtils.degToRad(CAMERA_FOV) / 2) * (cam.aspect || 1)
    const distance = Math.max(CAMERA_DISTANCE, (props.fitWidth ?? FIT_WIDTH) / 2 / halfWidth)
    const scale = distance / CAMERA_DISTANCE
    cam.position.set(0, view.y + CAMERA_RISE * scale, distance)
    cam.lookAt(0, view.y, 0)
    // The middle of the view, where the line of sight meets the Spines.
    scroll.focusY = view.y + CAMERA_RISE * scale * FOCUS_Z / distance
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
