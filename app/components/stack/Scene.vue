<script setup lang="ts">
// The Stack view: the whole Library as one pile of Books, no Bookcase. The
// camera looks slightly down at the pile; the wheel, dragging and the arrow
// keys scroll smoothly up and down it (a flicked finger glides on). Scrolling
// pauses while a Book is out. The scroll goes to the Books' scroll highlight.
// Touch feels to compare on a phone: ?touch=a|b|c (utils/stack/touchScroll.ts).
import type { DirectionalLight, Group, PerspectiveCamera } from 'three'
import { useLoop, useTres } from '@tresjs/core'
import { MathUtils } from 'three'
import { FLOOR_SHADOW } from '#layers/regal/app/utils/bookcase/scene'
import { focusLine, STACK_SCROLL } from '#layers/regal/app/utils/stack/scrollHighlight'
import { shadowFor } from '#layers/regal/app/utils/stage/quality'
import type { StackScroll } from '#layers/regal/app/utils/stack/scrollHighlight'
import { glideStep, releaseSpeed, snapView, startGlide, touchFeel, trackTouch } from '#layers/regal/app/utils/stack/touchScroll'
import type { Glide, TouchSample } from '#layers/regal/app/utils/stack/touchScroll'
import { topAt, viewForTop } from '#layers/regal/app/utils/stack/camera'

const props = defineProps<{
  stackHeight: number
  /** Width (metres) the view must fit; wider when dates stand beside the pile. */
  fitWidth?: number
  /** Centre heights of the Books, for a touch glide that lands on one. */
  bookHeights?: number[]
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
/** Where the bottom of the pile sits at the end of scrolling: 0 = centre, -1 = lower edge of the view. */
const BOTTOM_AT = -0.75
/** A finger that travelled less than this (px) tapped: no glide (a tap may pick a Book). */
const TAP_TRAVEL = 6

const { camera, renderer, sizes } = useTres()
const { onBeforeRender } = useLoop()
const { pickedId } = useBookPick()
const { scrolled } = useScrollLead()
const reducedMotion = usePreferredReducedMotion()
const quality = useRenderQuality()
const route = useRoute()
/** A touch feel to try (dev only); null keeps the first one (DRAG_SPEED, FLING_SECONDS). */
const feel = computed(() => (import.meta.dev ? touchFeel(route.query.touch) : null))

const cameraRef = shallowRef<PerspectiveCamera | null>(null)
const rig = shallowRef<Group | null>(null)
const keyLight = shallowRef<DirectionalLight | null>(null)

/** The height the camera looks at, and where it is easing to. */
const view = { y: 0.2, target: 0.2 }
/** Camera distance relative to CAMERA_DISTANCE (narrow views step back). */
const zoom = ref(1)

/**
 * The lowest height the camera looks at: the bottom of the pile (y = 0) then
 * shows at BOTTOM_AT of the view's half height, near its lower edge, instead
 * of mid-view.
 */
const lowest = computed(() => {
  const distance = CAMERA_DISTANCE * zoom.value
  const rise = CAMERA_RISE * zoom.value
  const down = Math.atan(rise / distance) + Math.atan(-BOTTOM_AT * Math.tan(MathUtils.degToRad(CAMERA_FOV) / 2))
  return Math.max(0.1, distance * Math.tan(down) - rise)
})
/**
 * The highest: the top of the pile shows at the start place for this view's
 * shape (utils/stack/camera.ts), mid-view on wide stages, high on a phone.
 */
const highest = computed(() => {
  const distance = CAMERA_DISTANCE * zoom.value
  return viewForTop(props.stackHeight - 0.06, topAt(sizes.aspectRatio.value), distance, CAMERA_RISE * zoom.value, CAMERA_FOV)
})
const bounds = computed<[number, number]>(() => [lowest.value, Math.max(lowest.value, highest.value)])
let placed = false

/** The scroll for the Books' scroll highlight (utils/stack/scrollHighlight.ts), updated every frame. */
const scroll: StackScroll = { focusY: view.y, speed: 0, targetY: view.y, halfView: CAMERA_DISTANCE * Math.tan(MathUtils.degToRad(CAMERA_FOV) / 2) }
let previousY = view.y
provide(STACK_SCROLL, scroll)

// The stage's shape (and the zoom) is only known once the canvas has a size, and
// changes when a phone turns: a pile resting at its top stays there. A new pile
// (other filters) keeps the position as before, just inside the new bounds.
let heightSeen = props.stackHeight
watch(bounds, ([low, high], [, wasHigh]) => {
  const sameStack = props.stackHeight === heightSeen
  heightSeen = props.stackHeight
  if (!sameStack) return
  if (view.target >= wasHigh - 1e-6) {
    view.target = high
    view.y = high
    previousY = high
  }
  else view.target = MathUtils.clamp(view.target, low, high)
})

watch(() => props.stackHeight, (height) => {
  const top = bounds.value[1]
  // Start at the top of the pile (what you're reading now, in focus); keep position on later changes.
  if (!placed || view.target > bounds.value[1]) {
    view.target = top
    view.y = top
    previousY = top
    // The Books' load order reads the focus before the first frame sets it.
    scroll.focusY = top
    scroll.targetY = top
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
  stopTouchScroll()
  scrollBy(-event.deltaY * WHEEL_SPEED)
}

let dragging = false
let lastY = 0
/** Speed (m/s) of a touch drag and when it last moved, for the fling. */
let dragSpeed = 0
let lastMoveAt = 0

// Touch feels (?touch=a|b|c): the finger's recent positions and travel, and the glide after it.
const touches: TouchSample[] = []
let touchTravel = 0
let touching = false
const glide: Glide = { speed: 0, rest: null }
/** The view sits where the finger and glide put it, without easing (feels with `direct`). */
let following = false
/** Metres the Spines move on screen per CSS pixel, and the focus line's offset from the view; kept by the frame loop. */
let pixelMetres = DRAG_SPEED / 2
let lineOffset = 0

function stopTouchScroll() {
  glide.speed = 0
  glide.rest = null
  following = false
}

/** The Books' focus line for the view at `centre` (as the frame loop sets it). */
function focusOf(centre: number) {
  return focusLine(centre, bounds.value, focusEnds()) + lineOffset
}

function focusEnds(): [number, number] {
  return [0.015, Math.max(0.015, props.stackHeight - 0.015)]
}

function onPointerDown(event: PointerEvent) {
  if (pickedId.value) return
  // Touch has no hover: the scroll focus leads.
  if (event.pointerType !== 'mouse') scrolled()
  dragging = true
  lastY = event.clientY
  dragSpeed = 0
  lastMoveAt = event.timeStamp
  touching = event.pointerType !== 'mouse' && !!feel.value
  if (!touching) {
    stopTouchScroll()
    return
  }
  // A finger on a gliding pile stops it where it shows.
  stopTouchScroll()
  following = feel.value!.direct
  view.target = view.y
  touches.length = 0
  touchTravel = 0
  trackTouch(touches, event.timeStamp, event.clientY)
}

function onPointerMove(event: PointerEvent) {
  // A release outside the window never reaches us: no button down, no drag.
  if (dragging && !(event.buttons & 1)) dragging = false
  if (!dragging) return
  const dy = event.clientY - lastY
  lastY = event.clientY
  if (dy === 0) return
  if (touching && feel.value) {
    touchTravel += Math.abs(dy)
    trackTouch(touches, event.timeStamp, event.clientY)
    scrollBy(dy * feel.value.gain * pixelMetres)
    return
  }
  const seconds = (event.timeStamp - lastMoveAt) / 1000
  if (seconds > 0) dragSpeed += (dy * DRAG_SPEED / seconds - dragSpeed) * 0.6
  lastMoveAt = event.timeStamp
  scrollBy(dy * DRAG_SPEED)
}

function onPointerUp(event: PointerEvent) {
  if (touching) {
    touching = false
    dragging = false
    const current = feel.value
    if (!current || pickedId.value || touchTravel < TAP_TRAVEL) return
    const speed = event.type === 'pointerup' ? releaseSpeed(touches, event.timeStamp) * current.gain * pixelMetres : 0
    const centres = props.bookHeights ?? []
    Object.assign(glide, startGlide(current, view.target, speed, bounds.value, centre => snapView(centre, centres, focusOf, bounds.value)))
    return
  }
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
  if (event.key in steps || event.key === 'Home' || event.key === 'End') stopTouchScroll()
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
  // Phones get a smaller map, as soft (utils/stage/quality.ts).
  const { mapSize, radius } = shadowFor(quality.value, 2048, 6)
  light.shadow.mapSize.set(mapSize, mapSize)
  light.shadow.camera.near = 0.1
  light.shadow.camera.far = 8
  light.shadow.camera.left = -0.8
  light.shadow.camera.right = 0.8
  light.shadow.camera.top = 0.9
  light.shadow.camera.bottom = -0.9
  light.shadow.bias = -0.0004
  light.shadow.normalBias = 0.01
  light.shadow.radius = radius
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

/** One frame of a touch glide; it stops at either end of the pile and while a Book is out. */
function moveGlide(seconds: number) {
  const current = feel.value
  if (!current || pickedId.value) {
    stopTouchScroll()
    return
  }
  const free = view.target + glideStep(glide, current.glideTau, seconds)
  view.target = MathUtils.clamp(free, ...bounds.value)
  if (view.target !== free) glide.speed = 0
  if (glide.speed === 0) {
    // A snapping glide ends exactly on its Book.
    if (glide.rest !== null) view.target = glide.rest
    glide.rest = null
  }
}

onBeforeRender(({ delta }) => {
  const seconds = delta || 0.016
  if (glide.speed !== 0 || glide.rest !== null) moveGlide(seconds)
  const smoothing = reducedMotion.value === 'reduce' || following ? 1 : 1 - Math.exp(-seconds * 7)
  view.y += (view.target - view.y) * smoothing
  // Smoothed, and a jump (a new pile, reduced motion) counts no faster than 3 m/s.
  const speed = MathUtils.clamp((view.y - previousY) / seconds, -3, 3)
  scroll.speed += (speed - scroll.speed) * (1 - Math.exp(-seconds * 20))
  if (Math.abs(scroll.speed) < 1e-4) scroll.speed = 0
  previousY = view.y
  const ends = focusEnds()
  scroll.focusY = focusLine(view.y, bounds.value, ends)
  scroll.targetY = focusLine(view.target, bounds.value, ends)
  const cam = (cameraRef.value ?? camera.value) as PerspectiveCamera | undefined
  if (cam) {
    // Narrow views (a portfolio sidebar) step back until the pile fits the width.
    const halfWidth = Math.tan(MathUtils.degToRad(CAMERA_FOV) / 2) * (cam.aspect || 1)
    const distance = Math.max(CAMERA_DISTANCE, (props.fitWidth ?? FIT_WIDTH) / 2 / halfWidth)
    const scale = distance / CAMERA_DISTANCE
    if (Math.abs(scale - zoom.value) > 0.01) zoom.value = scale
    cam.position.set(0, view.y + CAMERA_RISE * scale, distance)
    cam.lookAt(0, view.y, 0)
    // The middle of the view, where the line of sight meets the Spines.
    lineOffset = CAMERA_RISE * scale * FOCUS_Z / distance
    pixelMetres = 2 * (distance - FOCUS_Z) * Math.tan(MathUtils.degToRad(CAMERA_FOV) / 2) / Math.max(1, sizes.height.value)
    scroll.focusY = focusLine(view.y, bounds.value, ends) + lineOffset
    scroll.targetY = focusLine(view.target, bounds.value, ends) + lineOffset
    scroll.halfView = distance * Math.tan(MathUtils.degToRad(CAMERA_FOV) / 2)
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
