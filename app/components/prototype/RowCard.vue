<script setup lang="ts">
// Design round (horizontal Stack): one row of Books inline in a card, the
// way Libellus would embed it (year in review, Profile). It fills its box.
//
// Scrolling is the browser's own: the card is a horizontal scroll container
// (overflow-x) holding a track as wide as the row, with the canvas sticky at
// its left edge. Swiping sideways scrolls the row (with the platform's own
// momentum and edge bounce), swiping up or down scrolls the page as usual
// (touch-action pan-x pan-y: nothing is trapped), a trackpad or Shift+wheel
// scrolls it, arrow keys too once focused. The camera follows scrollLeft,
// matched so the Spines move exactly with the finger. A mouse can also drag
// it. Month labels are HTML, placed each frame from the camera (in step with
// the 3D, not with the compositor's scroll).
//
// A Book taken out comes forward: tap/click turns it, a drag turns it freely,
// a flick turns it over, Back (the button, the browser's Back, Escape) or a
// tap beside it puts it back. The row doesn't scroll while a Book is out.
// Where it is inspected (props.inspect):
// - 'card': inside the card; the camera steps back from the row so the Book
//   can come towards it and grow, as in the Stack;
// - 'viewport': the card breaks out: its canvas moves into a fixed box over
//   the whole viewport (same pixels where the card is, RowScene's view
//   offset), the Book flies to the middle of the screen with the details as
//   a sheet (narrow) or a card (wide), and lands back in the card;
// - 'auto': the viewport on narrow screens (a phone), the card elsewhere.
import { ACESFilmicToneMapping, MathUtils, SRGBColorSpace, Vector3, VSMShadowMap } from 'three'
import gsap from 'gsap'
import type { PerspectiveCamera } from 'three'
import { TONE_MAPPING_EXPOSURE } from '#layers/regal/app/utils/bookcase/scene'
import type { Book } from '#layers/regal/shared/types/book'
import { SHELVED } from '#layers/regal/app/utils/books/pick'
import type { PickState } from '#layers/regal/app/utils/books/pick'
import { createRowView } from '#layers/regal/app/prototype/row/context'
import type { RowContext } from '#layers/regal/app/prototype/row/context'
import { inRowOrder, ROW_VARIANTS } from '#layers/regal/app/prototype/row/layout'
import type { RowVariantKey } from '#layers/regal/app/prototype/row/layout'
import type { RowOrder } from '#layers/regal/app/prototype/row/data'

const props = withDefaults(defineProps<{
  variant: RowVariantKey
  books: Book[]
  order?: RowOrder
  /** Shown over the row, as a card in Libellus would ('Read in 2025'). */
  title?: string
  /** Dev HUD: frames, render time, draw calls, textures, heap. */
  hud?: boolean
  /** Where a picked Book is inspected: in the card, the whole viewport, or by screen width. */
  inspect?: 'card' | 'viewport' | 'auto'
  /** Horizontal Stack: the Stack's hover and riffle turned with the pile, or tipping out at the top. */
  hoverLook?: 'stack' | 'tip'
  riffleLook?: 'stack' | 'tip'
  /** Where the row starts: its first Book, or its last (the Stack starts at what was read last). */
  start?: 'first' | 'last'
}>(), { order: 'newest', title: '', hud: false, inspect: 'card', hoverLook: 'stack', riffleLook: 'stack', start: 'first' })

const variant = computed(() => ROW_VARIANTS[props.variant])
const ordered = computed(() => inRowOrder(props.books, props.order))
const layout = computed(() => variant.value.layout(ordered.value))
const booksById = computed(() => new Map(props.books.map(book => [book.id, book])))

const root = ref<HTMLElement | null>(null)
const scroller = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const caption = ref<HTMLElement | null>(null)
const { width, height } = useElementSize(root)

const pick = ref<PickState>({ ...SHELVED })
const ctx: RowContext = {
  pick,
  hovered: ref(null),
  focused: ref(null),
  view: createRowView(),
  insets: { top: 0, bottom: 0, right: 0 },
  aside: ref(false),
  inspectFull: ref(false),
  zoom: { value: 1 },
  breakout: reactive({ active: false, rect: { left: 0, top: 0, width: 0, height: 0 } }),
  stats: { frames: 0, renderMs: 0, calls: 0, triangles: 0, textures: 0, geometries: 0, loopMs: [] },
  dim: { value: 0 },
  onCamera: null,
  visible: ref(true),
}
const pickedId = computed(() => pick.value.bookId)
const pickedBook = computed(() => (pickedId.value ? booksById.value.get(pickedId.value) ?? null : null))
const focusedBook = computed(() => (ctx.focused.value ? booksById.value.get(ctx.focused.value) ?? null : null))
const reducedMotion = usePreferredReducedMotion()
const quality = useRenderQuality()

// --- Scroll ↔ camera ------------------------------------------------------------------

/** Card px between the row's ends and the card's edges. */
const MARGIN = 14
/** Px per metre at the plane the camera looks at: the Spines move exactly with the finger. */
const pxPerMetre = computed(() => (height.value || 300) / variant.value.camera.viewHeight)
const extent = computed(() => layout.value.extent)
const contentPx = computed(() => (extent.value[1] - extent.value[0]) * pxPerMetre.value)
const scrolls = computed(() => contentPx.value + 2 * MARGIN > width.value + 1)
const trackWidth = computed(() => (scrolls.value ? Math.ceil(contentPx.value + 2 * MARGIN) : width.value))
/** Camera x at scrollLeft 0, and its range. */
const cameraStart = computed(() => (scrolls.value
  ? extent.value[0] + (width.value / 2 - MARGIN) / pxPerMetre.value
  : (extent.value[0] + extent.value[1]) / 2))
const maxScroll = computed(() => Math.max(0, trackWidth.value - width.value))

/** Scroll progress 0..1, for the hairline indicator. */
const progress = ref(0)

/** The row starts at its last Book once (the Stack starts at its top). */
let started = false
watch(maxScroll, (max) => {
  if (started || !max || !scroller.value) return
  started = true
  if (props.start === 'last') scroller.value.scrollLeft = max
}, { flush: 'post' })

function syncCamera() {
  const element = scroller.value
  const left = element ? element.scrollLeft : 0
  ctx.view.cameraX = cameraStart.value + left / pxPerMetre.value
  ctx.view.bounds = [cameraStart.value, cameraStart.value + maxScroll.value / pxPerMetre.value]
  progress.value = maxScroll.value ? left / maxScroll.value : 0
}

watch([cameraStart, maxScroll, pxPerMetre], () => nextTick(syncCamera), { immediate: true })

function onScroll() {
  syncCamera()
  // The scroll leads: the riffle runs and hover waits until the mouse moves again (as in the Stack).
  if (started) {
    ctx.view.scrollLed = true
    mouseTravel = 0
  }
}

// A mouse drags the row too (touch and trackpads scroll it natively), and
// lets it glide on a little.
let drag: { x: number, left: number, lastX: number, lastT: number, speed: number } | null = null
let glideFrame = 0

function stopGlide() {
  cancelAnimationFrame(glideFrame)
  glideFrame = 0
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || event.button !== 0 || pickedId.value || !scroller.value) return
  stopGlide()
  drag = { x: event.clientX, left: scroller.value.scrollLeft, lastX: event.clientX, lastT: event.timeStamp, speed: 0 }
}

function onPointerMove(event: PointerEvent) {
  notePointer(event)
  if (!drag || !scroller.value) return
  if (!(event.buttons & 1)) {
    drag = null
    return
  }
  const dt = Math.max(1, event.timeStamp - drag.lastT)
  drag.speed = drag.speed * 0.6 + ((event.clientX - drag.lastX) / dt) * 0.4
  drag.lastX = event.clientX
  drag.lastT = event.timeStamp
  scroller.value.scrollLeft = drag.left - (event.clientX - drag.x)
}

function onPointerUp() {
  if (!drag) return
  let speed = -drag.speed * 16
  drag = null
  if (reducedMotion.value === 'reduce' || Math.abs(speed) < 1) return
  const step = () => {
    if (!scroller.value || Math.abs(speed) < 0.3) return stopGlide()
    scroller.value.scrollLeft += speed
    speed *= 0.93
    glideFrame = requestAnimationFrame(step)
  }
  glideFrame = requestAnimationFrame(step)
}

/** Mouse travel since the last scroll; a little gives the lead back to hover. */
let mouseTravel = 0

/** Where a resting mouse or a finger is over the card (the fanned row focuses there). */
function notePointer(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || !root.value) return
  if (event.buttons) return
  if (ctx.view.scrollLed) {
    mouseTravel += Math.abs(event.movementX) + Math.abs(event.movementY)
    if (mouseTravel > 8) ctx.view.scrollLed = false
  }
  const rect = root.value.getBoundingClientRect()
  const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
  ctx.view.pointerPx = inside ? event.clientX - rect.left : null
}

function onTouch(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch || !root.value) {
    ctx.view.pointerPx = null
    ctx.view.touching = false
    return
  }
  ctx.view.touching = true
  ctx.view.scrollLed = true
  ctx.view.pointerPx = touch.clientX - root.value.getBoundingClientRect().left
}

function onMouseLeave() {
  ctx.view.pointerPx = null
}

function scrollStep(direction: number) {
  scroller.value?.scrollBy({ left: direction * width.value * 0.7, behavior: reducedMotion.value === 'reduce' ? 'auto' : 'smooth' })
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Enter' && !pickedId.value && ctx.focused.value) {
    event.preventDefault()
    pick.value = { bookId: ctx.focused.value, face: 'front' }
  }
}

// --- Labels -----------------------------------------------------------------------------

const labelElements = new Map<string, HTMLElement>()
function setLabel(key: string, element: unknown) {
  if (element instanceof HTMLElement) labelElements.set(key, element)
  else labelElements.delete(key)
}

/** One year on the whole row: the labels say the month only. */
const oneYear = computed(() => new Set(layout.value.markers.map(marker => /\d{4}$/.exec(marker.label)?.[0] ?? marker.label)).size === 1)
/** Px per character of the label font (IBM Plex Mono at 0.65 / 0.7 rem). */
const LABEL_CHAR = { tab: 6.4, leader: 6.4, floor: 6.9, stack: 7 }

/**
 * The labels that fit: the month, with its year where the year changes; a
 * label that would run into the one before it is left out (its divider, sheet
 * or step still shows), so short months don't pile their dates on each other.
 */
const labels = computed(() => {
  const look = variant.value.labels
  const k = pxPerMetre.value
  let lastRight = -Infinity
  let lastYear: string | null = null
  const shown = []
  for (const marker of layout.value.markers) {
    const [, month, year] = /^(.*?)(?: (\d{4}))?$/.exec(marker.label) ?? [marker.label, marker.label, undefined]
    // The horizontal Stack sets every month with its year small beside it, as the Stack's labels do.
    const stackLook = look === 'stack'
    const withYear = !!year && !oneYear.value && (stackLook || year !== lastYear)
    const text = withYear && !stackLook ? `${month} ${year}` : month!
    const small = withYear && stackLook ? year! : ''
    const left = marker.x * k
    const width = (text.length + small.length * 0.5 + String(marker.count).length + 1) * LABEL_CHAR[look] + 16
    // Centred dates (the Stack's) reach half their width to the left.
    const from = stackLook ? left - width / 2 : left
    if (from < lastRight + 6) continue
    lastRight = from + width
    if (year) lastYear = year
    shown.push({ ...marker, text, small })
  }
  return shown
})

/** World anchor of a label per look. */
/** The horizontal Stack's dates stand this high, above the tallest Books; their leader runs down to the row. */
const STACK_LABEL_Y = 0.272

function anchorOf(x: number, height: number | undefined, into: Vector3): Vector3 {
  const look = variant.value.labels
  if (look === 'tab') return into.set(x, height ?? 0.25, -0.006)
  if (look === 'stack') return into.set(x, STACK_LABEL_Y, 0)
  if (look === 'leader') return into.set(x, 0, 0.09)
  return into.set(x, 0, 0.1)
}

const point = new Vector3()
const posesById = computed(() => new Map(layout.value.poses.map(pose => [pose.bookId, pose])))
const focusLabel = ref<HTMLElement | null>(null)

ctx.onCamera = (camera: PerspectiveCamera, w: number, h: number) => {
  // Broken out, the labels stay in the card, under the veil: not placed.
  if (ctx.breakout.active) return
  for (const marker of labels.value) {
    const element = labelElements.get(marker.key)
    if (!element) continue
    anchorOf(marker.x, marker.height, point).project(camera)
    const x = (point.x + 1) / 2 * w
    const y = (1 - point.y) / 2 * h
    const off = x < -240 || x > w + 40
    element.style.visibility = off ? 'hidden' : 'visible'
    if (off) continue
    element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    if (variant.value.labels === 'stack') {
      // The leader line runs down from the date to the top of the row.
      point.set(marker.x, marker.height ?? 0.2, 0).project(camera)
      element.style.setProperty('--leader', `${Math.max(0, (1 - point.y) / 2 * h - y).toFixed(1)}px`)
    }
  }
  // The Stack's focus label: title and stars under the Book in focus (beside its end in the Stack).
  const label = focusLabel.value
  const pose = ctx.focused.value ? posesById.value.get(ctx.focused.value) : undefined
  if (label && pose) {
    point.set(pose.x, 0, pose.z + pose.depth / 2).project(camera)
    const x = MathUtils.clamp((point.x + 1) / 2 * w, 12, w - 12)
    const y = (1 - point.y) / 2 * h
    label.style.transform = `translate3d(${x.toFixed(1)}px, ${(y + 10).toFixed(1)}px, 0)`
  }
}

// --- Pick in the card ------------------------------------------------------------------

/** Wide cards show the details beside the Book; narrow ones a caption under it. */
const wide = computed(() => width.value / Math.max(1, height.value) > 1.8)
const { width: viewportWidth, height: viewportHeight } = useWindowSize()
/** Narrow screens (a phone): the details are a sheet on the viewport's bottom edge (as RegalBooksStage's). */
const NARROW = 560
const inspectsInViewport = computed(() => props.inspect === 'viewport' || (props.inspect === 'auto' && viewportWidth.value <= NARROW))
/** The card has broken out: the canvas covers the viewport while a Book is out (and on its way back). */
const broken = ref(false)
const sheet = computed(() => broken.value && viewportWidth.value <= NARROW)
watchEffect(() => {
  ctx.aside.value = broken.value ? !sheet.value : wide.value
})
const { width: captionWidth, height: captionHeight } = useElementSize(caption, undefined, { box: 'border-box' })
watchEffect(() => {
  const full = broken.value
  const h = Math.max(1, full ? viewportHeight.value : height.value)
  const w = Math.max(1, full ? viewportWidth.value : width.value)
  const out = !!pickedId.value
  ctx.insets.top = out && full ? 56 / h : 0
  if (full) {
    ctx.insets.bottom = out && sheet.value ? captionHeight.value / h : 0
    ctx.insets.right = out && !sheet.value ? (captionWidth.value + 32) / w : 0
  }
  else {
    ctx.insets.bottom = out && !wide.value ? captionHeight.value / h : 0
    ctx.insets.right = out && wide.value ? captionWidth.value / w : 0
  }
})

/** In the card the camera steps back this far while a Book is out (the Book comes forward and grows). */
const CARD_ZOOM = 1.55
const OUT_SECONDS = 1.0
const RETURN_SECONDS = 0.8
let landing: ReturnType<typeof setTimeout> | undefined

function breakOut() {
  const box = stage.value?.getBoundingClientRect()
  if (!box) return
  clearTimeout(landing)
  ctx.breakout.rect = { left: box.left, top: box.top, width: box.width, height: box.height }
  ctx.inspectFull.value = true
  broken.value = true
  ctx.breakout.active = true
  // The page stays put under the open Book (the card's place on screen is the camera's).
  document.documentElement.style.overflow = 'hidden'
}

function landBack() {
  clearTimeout(landing)
  landing = setTimeout(() => {
    if (pickedId.value) return
    ctx.breakout.active = false
    broken.value = false
    ctx.inspectFull.value = false
    document.documentElement.style.overflow = ''
  }, reducedMotion.value === 'reduce' ? 0 : RETURN_SECONDS * 1000 + 80)
}

watch(pickedId, (id, previous) => {
  if (id && !previous) {
    if (inspectsInViewport.value) breakOut()
    else gsap.to(ctx.zoom, { value: CARD_ZOOM, duration: reducedMotion.value === 'reduce' ? 0 : OUT_SECONDS, ease: 'power2.inOut', overwrite: true })
  }
  if (!id && previous) {
    gsap.to(ctx.zoom, { value: 1, duration: reducedMotion.value === 'reduce' ? 0 : RETURN_SECONDS, ease: 'power2.inOut', overwrite: true })
    if (broken.value) landBack()
  }
})

/** Touch on the canvas: both rows and the page scroll natively; a picked Book turns sideways; broken out, it has the screen. */
const touchAction = computed(() => (broken.value && pickedId.value ? 'none' : pickedId.value ? 'pan-y' : 'pan-x pan-y'))

// Back (the browser's, Android's) puts the Book away: a history entry while it is out.
let pushed = false
watch(pickedId, (id, previous) => {
  if (id && !previous && !pushed) {
    history.pushState({ ...history.state, regalRowPick: true }, '')
    pushed = true
  }
  if (!id && previous && pushed) {
    pushed = false
    if (history.state?.regalRowPick) history.back()
  }
})
function onPopState() {
  if (!pushed) return
  pushed = false
  pick.value = SHELVED
}

function putAway() {
  pick.value = SHELVED
}

function turn() {
  if (pick.value.bookId) pick.value = { bookId: pick.value.bookId, face: pick.value.face === 'front' ? 'back' : 'front' }
}

const readDate = computed(() => {
  const value = pickedBook.value?.dateRead
  if (!value) return pickedBook.value?.status === 'currently-reading' ? 'Reading now' : ''
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
})

// --- Visibility, HUD -------------------------------------------------------------------

let observer: IntersectionObserver | null = null
const hudText = ref('')
let hudTimer: ReturnType<typeof setInterval> | undefined
let lastFrames = 0

onMounted(() => {
  observer = new IntersectionObserver(([entry]) => {
    ctx.visible.value = !!entry?.isIntersecting
  }, { rootMargin: '100px' })
  if (root.value) observer.observe(root.value)
  window.addEventListener('pointermove', notePointer, { passive: true })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('popstate', onPopState)
  syncCamera()
  // The dev measurements read every card's numbers.
  const cards = ((window as { __rowCards?: unknown[] }).__rowCards ??= [])
  cards.push({ variant: props.variant, stats: ctx.stats, view: ctx.view, pick, focused: ctx.focused, books: () => layout.value.poses.length })
  if (props.hud) {
    hudTimer = setInterval(() => {
      const s = ctx.stats
      const fps = s.frames - lastFrames
      lastFrames = s.frames
      const heap = (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize
      hudText.value = `${fps} fr/s · ${s.renderMs.toFixed(1)} ms · ${s.calls} calls · ${s.textures} tex${heap ? ` · ${(heap / 1048576).toFixed(0)} MB` : ''}`
    }, 1000)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  stopGlide()
  window.removeEventListener('pointermove', notePointer)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('popstate', onPopState)
  clearInterval(hudTimer)
  clearTimeout(landing)
  gsap.killTweensOf(ctx.zoom)
  if (broken.value) document.documentElement.style.overflow = ''
  ctx.onCamera = null
})

const dpr = computed<[number, number]>(() => [1, quality.value.maxDpr])
const clampDeg = (value: number) => MathUtils.clamp(value, 0, 1)
</script>

<template>
  <section
    ref="root"
    class="row-card"
    :class="[`row-card--${variant.key}`, { 'row-card--picked': pickedId, 'row-card--wide': wide }]"
    :data-variant="variant.key"
    :data-picked="pickedId ?? ''"
    :aria-label="title || 'Books read'"
    @mouseleave="onMouseLeave"
  >
    <div
      ref="scroller"
      class="row-card__scroller"
      tabindex="0"
      :aria-label="`${books.length} books, scroll sideways`"
      @scroll.passive="onScroll"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @touchstart.passive="onTouch"
      @touchmove.passive="onTouch"
      @touchend.passive="onTouch"
      @touchcancel.passive="onTouch"
      @keydown="onKey"
    >
      <div
        class="row-card__track"
        :style="{ width: `${trackWidth}px` }"
      >
        <div
          ref="stage"
          class="row-card__stage"
          :style="{ width: `${width}px` }"
        >
          <Teleport
            to="body"
            :disabled="!broken"
          >
            <div
              class="row-card__view"
              :class="{ 'row-card__view--out': broken }"
            >
              <ClientOnly>
                <TresCanvas
                  class="row-card__canvas"
                  :style="{ touchAction }"
                  :alpha="true"
                  :clear-alpha="0"
                  :premultiplied-alpha="true"
                  shadows
                  :shadow-map-type="VSMShadowMap"
                  :tone-mapping="ACESFilmicToneMapping"
                  :tone-mapping-exposure="TONE_MAPPING_EXPOSURE"
                  :output-color-space="SRGBColorSpace"
                  :dpr="dpr"
                >
                  <PrototypeRowScene
                    :variant="variant"
                    :layout="layout"
                    :books="ordered"
                    :ctx="ctx"
                    :hover-look="hoverLook"
                    :riffle-look="riffleLook"
                  />
                </TresCanvas>
              </ClientOnly>
              <div
                v-show="!broken"
                class="row-card__labels"
                :class="`row-card__labels--${variant.labels}`"
                aria-hidden="true"
              >
                <div
                  v-for="label in labels"
                  :key="label.key"
                  :ref="(element: unknown) => setLabel(label.key, element)"
                  class="row-label"
                >
                  <span class="row-label__inner">
                    <span class="row-label__text">{{ label.text }}</span>
                    <sup
                      v-if="label.small"
                      class="row-label__small"
                    >{{ label.small }}</sup>
                    <span class="row-label__count">{{ label.count }}</span>
                  </span>
                </div>
                <p
                  v-if="variant.labels === 'stack' && focusedBook && !pickedId"
                  ref="focusLabel"
                  class="row-focus"
                >
                  <span class="row-focus__inner">
                    <BooksTitleStars :book="focusedBook" />
                  </span>
                </p>
              </div>
            </div>
          </Teleport>
        </div>
      </div>
    </div>

    <!-- Over the row: what is in focus, the way back, the details. -->
    <header
      v-if="!pickedId && variant.labels !== 'stack'"
      class="row-card__head"
    >
      <p
        v-if="title"
        class="row-card__title"
      >
        {{ title }}
      </p>
      <p
        v-if="!pickedId && focusedBook"
        class="row-card__focus"
      >
        <BooksTitleStars :book="focusedBook" />
      </p>
    </header>

    <div
      v-if="scrolls && !pickedId"
      class="row-card__progress"
      aria-hidden="true"
    >
      <span :style="{ left: `${clampDeg(progress) * (100 - Math.min(100, width / trackWidth * 100))}%`, width: `${Math.min(100, width / trackWidth * 100)}%` }" />
    </div>

    <button
      v-if="scrolls && !pickedId && progress > 0.001"
      type="button"
      class="row-card__arrow row-card__arrow--left"
      aria-label="Scroll left"
      tabindex="-1"
      @click="scrollStep(-1)"
    >
      ‹
    </button>
    <button
      v-if="scrolls && !pickedId && progress < 0.999"
      type="button"
      class="row-card__arrow row-card__arrow--right"
      aria-label="Scroll right"
      tabindex="-1"
      @click="scrollStep(1)"
    >
      ›
    </button>

    <Teleport
      to="body"
      :disabled="!broken"
    >
      <button
        v-if="pickedId"
        type="button"
        class="row-card__back"
        :class="{ 'row-card__back--out': broken }"
        @click="putAway"
      >
        ← Back
      </button>

      <div
        v-if="pickedBook"
        ref="caption"
        class="row-card__details"
        :class="{
          'row-card__details--side': !broken && wide,
          'row-card__details--sheet': sheet,
          'row-card__details--card': broken && !sheet,
        }"
      >
        <p class="row-card__book-title">
          {{ pickedBook.title }}
        </p>
        <p class="row-card__book-meta">
          {{ pickedBook.author }}<template v-if="readDate">
            · {{ readDate }}
          </template>
          <span
            v-if="pickedBook.rating"
            class="row-card__book-stars"
          >
            <BooksTitleStars :book="{ title: '', rating: pickedBook.rating }" />
          </span>
        </p>
        <p
          v-if="(broken || wide) && pickedBook.description"
          class="row-card__book-review"
        >
          {{ pickedBook.description }}
        </p>
        <p
          v-if="(broken || wide) && pickedBook.review"
          class="row-card__book-review row-card__book-review--own"
        >
          {{ pickedBook.reviewHasSpoiler ? 'Review hidden (spoilers).' : pickedBook.review }}
        </p>
        <p class="row-card__book-hint">
          <button
            type="button"
            class="row-card__link"
            @click="turn"
          >
            {{ pick.face === 'front' ? 'Turn over' : 'Front' }}
          </button>
          · drag or flick to turn
        </p>
      </div>
    </Teleport>

    <p
      v-if="hud"
      class="row-card__hud"
    >
      {{ variant.key }} · {{ layout.poses.length }} books · {{ hudText }}
    </p>
  </section>
</template>

<style scoped>
.row-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--color-ink, #2C2C2A);
  background: var(--color-bg, #F5F2EB);
  color: var(--color-ink, #2C2C2A);
  font-family: var(--font-mono, 'IBM Plex Mono', 'Courier New', Courier, monospace);
  font-size: var(--text-sm, 0.75rem);
  line-height: 1.35;
  isolation: isolate;
}

.row-card *,
.row-card *::before,
.row-card *::after {
  box-sizing: border-box;
}

.row-card__scroller {
  position: absolute;
  inset: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  outline: none;
}

.row-card__scroller::-webkit-scrollbar {
  display: none;
}

.row-card__scroller:focus-visible {
  outline: 2px solid var(--color-accent, #B93E2E);
  outline-offset: -3px;
}

.row-card--picked .row-card__scroller {
  overflow-x: hidden;
}

.row-card__track {
  position: relative;
  height: 100%;
}

.row-card__stage {
  position: sticky;
  left: 0;
  height: 100%;
}

.row-card__view {
  position: absolute;
  inset: 0;
}

/* Broken out: over the whole viewport, above the page, below the host's sticky bars' panels. */
.row-card__view--out {
  position: fixed;
  z-index: var(--regal-row-z-index, 30);
}

.row-card__canvas {
  position: absolute !important;
  inset: 0;
}

/* The horizontal Stack's dates: the Stack's flat label with its leader line, above the row. */
.row-card__labels--stack .row-label__inner {
  bottom: 0;
  left: 0;
  transform: translateX(-50%);
  font-size: var(--text-xs, 0.7rem);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--color-ink, #2C2C2A);
}

.row-card__labels--stack .row-label__inner::after {
  content: '';
  position: absolute;
  top: calc(100% + 2px);
  left: 50%;
  width: 1px;
  height: max(0px, calc(var(--leader, 0px) - 4px));
  background: var(--color-ink, #2C2C2A);
}

.row-card__labels--stack .row-label__small {
  margin-left: -0.25em;
  font-size: 0.5em;
  font-weight: 600;
  vertical-align: 0.55em;
  line-height: 0;
}

.row-card__labels--stack .row-label__count {
  font-size: 0.6em;
  font-weight: 500;
}

/* The Stack's focus label, under the Book in focus. */
.row-focus {
  position: absolute;
  top: 0;
  left: 0;
  margin: 0;
  will-change: transform;
}

.row-focus__inner {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  max-width: 15rem;
  padding: 0.2rem 0.45rem;
  overflow: hidden;
  border: 1px solid var(--color-ink, #2C2C2A);
  background: var(--color-bg, #F5F2EB);
  font-size: var(--text-2xs, 0.65rem);
  white-space: nowrap;
  transform: translateX(-50%);
}

.row-focus__inner :deep(.title-stars__title) {
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-card__labels {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  transition: opacity 0.3s;
}

.row-card--picked .row-card__labels {
  opacity: 0.15;
}

.row-label {
  position: absolute;
  top: 0;
  left: 0;
  visibility: hidden;
  will-change: transform;
}

.row-label__inner {
  position: absolute;
  display: flex;
  gap: 0.35em;
  align-items: baseline;
  white-space: nowrap;
  font-size: var(--text-2xs, 0.65rem);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.row-label__count {
  color: var(--color-accent, #B93E2E);
}

/* (a) An index tab sticking up from the card between the months. */
.row-card__labels--tab .row-label__inner {
  bottom: 0;
  left: -1px;
  padding: 0.1rem 0.35rem 0.05rem;
  border: 1px solid var(--color-ink, #2C2C2A);
  border-bottom: 0;
  background: #EDE7DA;
}

/* (b) Beside the pile, the Stack's flat label with a leader line, under it here. */
.row-card__labels--leader .row-label__inner {
  top: 0;
  left: 0;
  padding-top: 0.7rem;
  padding-left: 0.3rem;
  border-left: 1px solid var(--color-ink, #2C2C2A);
}

/* (c) On the floor in front of the month. */
.row-card__labels--floor .row-label__inner {
  top: 0.15rem;
  left: 0;
  padding-left: 0.35rem;
  border-left: 1px solid var(--color-accent, #B93E2E);
  font-size: var(--text-xs, 0.7rem);
  color: var(--color-ink-muted, #6B6B69);
}

.row-card__head {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.55rem 0.7rem 0;
  pointer-events: none;
}

/* (a) Its tabs stand at the top: what is in focus goes to the bottom. */
.row-card--a .row-card__head {
  top: auto;
  bottom: 0.8rem;
  flex-direction: column-reverse;
}

.row-card__title {
  margin: 0;
  font-size: var(--text-2xs, 0.65rem);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-ink-muted, #6B6B69);
}

.row-card__focus {
  margin: 0;
  display: flex;
  gap: 0.5em;
  align-items: baseline;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--text-xs, 0.7rem);
}

.row-card__progress {
  position: absolute;
  left: 0.7rem;
  right: 0.7rem;
  bottom: 0.45rem;
  height: 1px;
  background: var(--color-line, rgba(44, 44, 42, 0.14));
  pointer-events: none;
}

.row-card__progress span {
  position: absolute;
  top: -1px;
  height: 3px;
  background: var(--color-ink, #2C2C2A);
}

.row-card__arrow {
  position: absolute;
  top: 50%;
  z-index: 2;
  width: 1.8rem;
  height: 2.4rem;
  margin-top: -1.2rem;
  border: 1px solid var(--color-ink, #2C2C2A);
  background: var(--color-bg, #F5F2EB);
  color: var(--color-ink, #2C2C2A);
  font: inherit;
  font-size: 1.1rem;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.row-card:hover .row-card__arrow {
  opacity: 0.85;
}

.row-card__arrow:hover {
  color: var(--color-accent, #B93E2E);
}

.row-card__arrow--left {
  left: 0.4rem;
}

.row-card__arrow--right {
  right: 0.4rem;
}

@media (pointer: coarse) {
  .row-card__arrow {
    display: none;
  }
}

.row-card__back {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 3;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--color-ink, #2C2C2A);
  background: var(--color-bg, #F5F2EB);
  color: var(--color-ink, #2C2C2A);
  font: inherit;
  font-size: var(--text-2xs, 0.65rem);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.row-card__back--out {
  position: fixed;
  top: 0.8rem;
  left: 0.8rem;
  z-index: calc(var(--regal-row-z-index, 30) + 1);
}

.row-card__back:hover {
  color: var(--color-accent, #B93E2E);
}

.row-card__details {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  padding: 0.5rem 0.7rem 0.55rem;
  border-top: 1px solid var(--color-ink, #2C2C2A);
  background: var(--color-bg, #F5F2EB);
}

.row-card__details--side {
  top: 0;
  left: auto;
  width: 40%;
  padding: 0.8rem 0.9rem;
  border-top: 0;
  border-left: 1px solid var(--color-ink, #2C2C2A);
  overflow-y: auto;
}

/* Broken out, narrow: a sheet on the viewport's bottom edge (as RegalBooksStage's). */
.row-card__details--sheet {
  position: fixed;
  right: -1px;
  bottom: -1px;
  left: -1px;
  z-index: calc(var(--regal-row-z-index, 30) + 1);
  max-height: 34dvh;
  padding: 0.8rem 1rem 1rem;
  border: 1px solid var(--color-ink, #2C2C2A);
  overflow-y: auto;
  font-size: var(--text-sm, 0.75rem);
}

/* Broken out, wide: the Stack's details card, bottom right. */
.row-card__details--card {
  position: fixed;
  top: auto;
  right: 1rem;
  bottom: 1rem;
  left: auto;
  z-index: calc(var(--regal-row-z-index, 30) + 1);
  width: min(22rem, calc(100vw - 2rem));
  max-height: calc(100dvh - 2rem);
  padding: 0.9rem 1rem;
  border: 1px solid var(--color-ink, #2C2C2A);
  overflow-y: auto;
  font-size: var(--text-sm, 0.75rem);
}

.row-card__book-stars {
  margin-left: 0.5em;
}

.row-card__book-review--own {
  font-style: italic;
}

.row-card__details p {
  margin: 0;
}

.row-card__book-title {
  font-weight: 600;
  font-size: var(--text-sm, 0.75rem);
}

.row-card__book-meta,
.row-card__book-hint {
  color: var(--color-ink-muted, #6B6B69);
  font-size: var(--text-2xs, 0.65rem);
}

.row-card__book-review {
  margin-top: 0.5rem !important;
  font-size: var(--text-2xs, 0.65rem);
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.row-card__book-hint {
  margin-top: 0.25rem !important;
}

.row-card__link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-accent, #B93E2E);
  font: inherit;
  cursor: pointer;
}

.row-card__hud {
  position: absolute;
  right: 0.4rem;
  bottom: 0.7rem;
  z-index: 4;
  margin: 0;
  padding: 0.1rem 0.3rem;
  background: rgba(245, 242, 235, 0.9);
  font-size: 0.6rem;
  pointer-events: none;
}
</style>
