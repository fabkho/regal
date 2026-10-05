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
// A Book taken out comes forward inside the card: tap/click turns it, a drag
// turns it freely, Back (the button, the browser's Back, Escape) or a tap
// beside it puts it back. The row doesn't scroll while a Book is out.
import { ACESFilmicToneMapping, MathUtils, SRGBColorSpace, Vector3, VSMShadowMap } from 'three'
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
}>(), { order: 'newest', title: '', hud: false })

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
  insets: { top: 0, bottom: 0 },
  aside: ref(false),
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

/** Where a resting mouse or a finger is over the card (the fanned row focuses there). */
function notePointer(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || !root.value) return
  if (event.buttons) return
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
const LABEL_CHAR = { tab: 6.4, leader: 6.4, floor: 6.9 }

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
    const withYear = !!year && year !== lastYear && !oneYear.value
    const text = withYear ? `${month} ${year}` : month!
    const left = marker.x * k
    const width = (text.length + String(marker.count).length + 1) * LABEL_CHAR[look] + 16
    if (left < lastRight + 6) continue
    lastRight = left + width
    if (year) lastYear = year
    shown.push({ ...marker, text })
  }
  return shown
})

/** World anchor of a label per look. */
function anchorOf(x: number, height: number | undefined, into: Vector3): Vector3 {
  const look = variant.value.labels
  if (look === 'tab') return into.set(x, height ?? 0.25, -0.006)
  if (look === 'leader') return into.set(x, 0, 0.09)
  return into.set(x, 0, 0.1)
}

const point = new Vector3()
ctx.onCamera = (camera: PerspectiveCamera, w: number, h: number) => {
  for (const marker of labels.value) {
    const element = labelElements.get(marker.key)
    if (!element) continue
    anchorOf(marker.x, marker.height, point).project(camera)
    const x = (point.x + 1) / 2 * w
    const y = (1 - point.y) / 2 * h
    const off = x < -240 || x > w + 40
    element.style.visibility = off ? 'hidden' : 'visible'
    if (!off) element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
  }
}

// --- Pick in the card ------------------------------------------------------------------

/** Wide cards show the details beside the Book; narrow ones a caption under it. */
const wide = computed(() => width.value / Math.max(1, height.value) > 1.8)
watchEffect(() => {
  ctx.aside.value = wide.value
})
const { height: captionHeight } = useElementSize(caption, undefined, { box: 'border-box' })
watchEffect(() => {
  ctx.insets.top = pickedId.value ? 44 / Math.max(1, height.value) : 0
  ctx.insets.bottom = pickedId.value && !wide.value ? captionHeight.value / Math.max(1, height.value) : 0
})

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
          <ClientOnly>
            <TresCanvas
              class="row-card__canvas"
              :style="{ touchAction: pickedId ? 'pan-y' : 'pan-x pan-y' }"
              :alpha="true"
              :clear-alpha="0"
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
              />
            </TresCanvas>
          </ClientOnly>
          <div
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
                <span class="row-label__count">{{ label.count }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Over the row: what is in focus, the way back, the details. -->
    <header
      v-if="!pickedId"
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

    <button
      v-if="pickedId"
      type="button"
      class="row-card__back"
      @click="putAway"
    >
      ← Back
    </button>

    <div
      v-if="pickedBook"
      ref="caption"
      class="row-card__details"
      :class="{ 'row-card__details--side': wide }"
    >
      <p class="row-card__book-title">
        {{ pickedBook.title }}
      </p>
      <p class="row-card__book-meta">
        {{ pickedBook.author }}<template v-if="readDate">
          · {{ readDate }}
        </template>
      </p>
      <p
        v-if="pickedBook.rating"
        class="row-card__book-stars"
      >
        <BooksTitleStars :book="{ title: '', rating: pickedBook.rating }" />
      </p>
      <p
        v-if="wide && pickedBook.review"
        class="row-card__book-review"
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
        · drag to turn
      </p>
    </div>

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

.row-card__canvas {
  position: absolute !important;
  inset: 0;
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
