<script setup lang="ts">
// A row of Books inline in a card (RegalBooksRow): the Stack turned 90°,
// oldest on the left, what was read last on the right. It fills its box.
//
// Scrolling is the browser's own: the card is a horizontal scroll container
// (overflow-x) holding a track as wide as the row, the canvas sticky at its
// left edge. Swiping sideways scrolls the row with the platform's momentum;
// swiping up or down scrolls the page as usual (touch-action pan-x pan-y:
// nothing is trapped); a trackpad or Shift+wheel scrolls it, arrow keys once
// focused, a mouse can drag it. The camera follows scrollLeft, matched so the
// Spines move with the finger. The dates are HTML, placed each frame from the
// camera, in step with the 3D.
//
// A Book taken out: tap or click turns it, a drag turns it, a flick turns it
// over; Back (the button, the browser's Back, Escape) or a tap beside it puts
// it back, from where it was shown. The row doesn't scroll while a Book is
// out. Where it is looked at (props.inspect):
// - 'card': in the card; the camera steps back from the row so the Book
//   comes towards it and grows a little, as in the Stack;
// - 'viewport': the row breaks out: its canvas moves into a fixed box over
//   the whole viewport (same pixels where the card is: RowScene's view
//   offset), the Book comes to the middle of the screen with the details as
//   a sheet (narrow) or a card (wide), and lands back in the row;
// - 'auto': the viewport on narrow screens (≤ 560 px, a phone), the card elsewhere.
import { ACESFilmicToneMapping, MathUtils, SRGBColorSpace, Vector3, VSMShadowMap } from 'three'
import type { PerspectiveCamera } from 'three'
import gsap from 'gsap'
import { TONE_MAPPING_EXPOSURE } from '#layers/regal/app/utils/bookcase/scene'
import type { Book } from '#layers/regal/shared/types/book'
import { SHELVED } from '#layers/regal/app/utils/books/pick'
import type { PickState } from '#layers/regal/app/utils/books/pick'
import { createRowView } from '#layers/regal/app/utils/row/context'
import type { RowContext } from '#layers/regal/app/utils/row/context'
import { layoutRow, ROW_CAMERA, ROW_LABEL_Y, rowLabels } from '#layers/regal/app/utils/row/layout'

const props = withDefaults(defineProps<{
  /** The Books, newest first (rowBooks). */
  books: Book[]
  /** Where a picked Book is looked at: in the card, the whole viewport, or by screen width. */
  inspect?: 'card' | 'viewport' | 'auto'
  /** Where the row starts: at what was read last (as the Stack), or at the first Book. */
  start?: 'newest' | 'oldest'
  /** What the row is, for assistive technology ('Books read in 2025'). */
  label?: string
}>(), { inspect: 'card', start: 'newest', label: 'Books read' })

const oldestFirst = computed(() => [...props.books].reverse())
const layout = computed(() => layoutRow(oldestFirst.value))
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
  inspectFull: ref(false),
  zoom: { value: 1 },
  breakout: reactive({ active: false, rect: { left: 0, top: 0, width: 0, height: 0 } }),
  dim: { value: 0 },
  onCamera: null,
  visible: ref(true),
}
const pickedId = computed(() => pick.value.bookId)
const pickedBook = computed(() => (pickedId.value ? booksById.value.get(pickedId.value) ?? null : null))
const focusedBook = computed(() => (ctx.focused.value ? booksById.value.get(ctx.focused.value) ?? null : null))
const reducedMotion = usePreferredReducedMotion()
const quality = useRenderQuality()

// The Stack's short vibrations: out, back, and a tick per Book while a finger scrolls.
const touchScrolling = ref(false)
useBookHaptics({ pickedId, focusedBook: ctx.focused, touchScrolling })

// --- Scroll ↔ camera ------------------------------------------------------------------

/** Card px between the row's ends and the card's edges. */
const MARGIN = 14
/** Px per metre at the plane the camera looks at: the Spines move with the finger. */
const pxPerMetre = computed(() => (height.value || 300) / ROW_CAMERA.viewHeight)
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
  if (props.start === 'newest') scroller.value.scrollLeft = max
}, { flush: 'post' })

function syncCamera() {
  const element = scroller.value
  const left = element ? element.scrollLeft : 0
  ctx.view.cameraX = cameraStart.value + left / pxPerMetre.value
  ctx.view.bounds = [cameraStart.value, cameraStart.value + maxScroll.value / pxPerMetre.value]
  progress.value = maxScroll.value ? left / maxScroll.value : 0
}

watch([cameraStart, maxScroll, pxPerMetre], () => nextTick(syncCamera), { immediate: true })

/** Mouse travel since the last scroll; a little gives the lead back to hover (as in the Stack). */
let mouseTravel = 0

function onScroll() {
  syncCamera()
  // The scroll leads: the riffle runs, hover waits until the mouse moves again.
  if (started) {
    ctx.view.scrollLed = true
    mouseTravel = 0
  }
}

function onScrollEnd() {
  if (!ctx.view.touching) touchScrolling.value = false
}

// A mouse drags the row too (touch and trackpads scroll it natively) and
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

function onMouseMove(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || event.buttons || !ctx.view.scrollLed) return
  mouseTravel += Math.abs(event.movementX) + Math.abs(event.movementY)
  if (mouseTravel > 8) ctx.view.scrollLed = false
}

function onTouch(event: TouchEvent) {
  const touching = event.touches.length > 0
  ctx.view.touching = touching
  if (touching) ctx.view.scrollLed = true
  if (event.type === 'touchmove') touchScrolling.value = true
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

// --- Dates and the focus label -----------------------------------------------------------

const labelElements = new Map<string, HTMLElement>()
function setLabel(key: string, element: unknown) {
  if (element instanceof HTMLElement) labelElements.set(key, element)
  else labelElements.delete(key)
}

const labels = computed(() => rowLabels(layout.value.markers, pxPerMetre.value))
const point = new Vector3()
const posesById = computed(() => new Map(layout.value.poses.map(pose => [pose.bookId, pose])))
const focusLabel = ref<HTMLElement | null>(null)

ctx.onCamera = (camera: PerspectiveCamera, w: number, h: number) => {
  // Broken out, the dates stay in the card, under the veil: not placed.
  if (ctx.breakout.active) return
  for (const label of labels.value) {
    const element = labelElements.get(label.key)
    if (!element) continue
    point.set(label.x, ROW_LABEL_Y, 0).project(camera)
    const x = (point.x + 1) / 2 * w
    const y = (1 - point.y) / 2 * h
    const off = x < -240 || x > w + 240
    element.style.visibility = off ? 'hidden' : 'visible'
    if (off) continue
    element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    // The leader line runs down from the date to the top of the row.
    point.set(label.x, label.height, 0).project(camera)
    element.style.setProperty('--leader', `${Math.max(0, (1 - point.y) / 2 * h - y).toFixed(1)}px`)
  }
  // The Stack's focus label: title and stars under the Book in focus (beside its end in the Stack).
  const element = focusLabel.value
  const pose = ctx.focused.value ? posesById.value.get(ctx.focused.value) : undefined
  if (element && pose) {
    point.set(pose.x, 0, pose.z + pose.depth / 2).project(camera)
    const x = MathUtils.clamp((point.x + 1) / 2 * w, 12, w - 12)
    const y = (1 - point.y) / 2 * h
    element.style.transform = `translate3d(${x.toFixed(1)}px, ${(y + 10).toFixed(1)}px, 0)`
  }
}

// --- A Book out ------------------------------------------------------------------------

/** Wide cards show the details beside the Book; narrow ones a caption under it. */
const wide = computed(() => width.value / Math.max(1, height.value) > 1.8)
const { width: viewportWidth, height: viewportHeight } = useWindowSize()
/** Narrow screens (a phone): broken out, the details are a sheet on the viewport's bottom edge (as RegalBooksStage's). */
const NARROW = 560
const inspectsInViewport = computed(() => props.inspect === 'viewport' || (props.inspect === 'auto' && viewportWidth.value <= NARROW))
/** The row has broken out: the canvas covers the viewport while a Book is out (and on its way back). */
const broken = ref(false)
const sheet = computed(() => broken.value && viewportWidth.value <= NARROW)
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

/** Touch on the canvas: the row and the page scroll natively; a picked Book turns sideways; broken out, it has the screen. */
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

// --- Visibility ------------------------------------------------------------------------

let observer: IntersectionObserver | null = null

onMounted(() => {
  observer = new IntersectionObserver(([entry]) => {
    ctx.visible.value = !!entry?.isIntersecting
  }, { rootMargin: '100px' })
  if (root.value) observer.observe(root.value)
  window.addEventListener('pointermove', onMouseMove, { passive: true })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('popstate', onPopState)
  syncCamera()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  stopGlide()
  window.removeEventListener('pointermove', onMouseMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('popstate', onPopState)
  clearTimeout(landing)
  gsap.killTweensOf(ctx.zoom)
  if (broken.value) document.documentElement.style.overflow = ''
  ctx.onCamera = null
})

const dpr = computed<[number, number]>(() => [1, quality.value.maxDpr])
const share = computed(() => Math.min(100, width.value / Math.max(1, trackWidth.value) * 100))
</script>

<template>
  <section
    ref="root"
    class="row-card"
    :class="{ 'row-card--picked': pickedId, 'row-card--wide': wide }"
    :data-picked="pickedId ?? ''"
    :data-book-count="layout.poses.length"
    :aria-label="label"
  >
    <div
      ref="scroller"
      class="row-card__scroller"
      tabindex="0"
      :aria-label="`${books.length} books, scroll sideways`"
      @scroll.passive="onScroll"
      @scrollend="onScrollEnd"
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
                  <RowScene
                    :layout="layout"
                    :books="oldestFirst"
                    :ctx="ctx"
                  />
                </TresCanvas>
              </ClientOnly>
              <div
                v-show="!broken"
                class="row-card__labels"
                aria-hidden="true"
              >
                <div
                  v-for="item in labels"
                  :key="item.key"
                  :ref="(element: unknown) => setLabel(item.key, element)"
                  class="row-label"
                >
                  <span class="row-label__inner">
                    <span class="row-label__text">{{ item.text }}</span>
                    <sup
                      v-if="item.small"
                      class="row-label__small"
                    >{{ item.small }}</sup>
                    <span class="row-label__count">{{ item.count }}</span>
                  </span>
                </div>
                <p
                  v-if="focusedBook && !pickedId"
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

    <div
      v-if="scrolls && !pickedId"
      class="row-card__progress"
      aria-hidden="true"
    >
      <span :style="{ left: `${MathUtils.clamp(progress, 0, 1) * (100 - share)}%`, width: `${share}%` }" />
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

      <Transition name="row-fade">
        <article
          v-if="pickedBook"
          ref="caption"
          class="row-card__details"
          :class="{
            'row-card__details--side': !broken && wide,
            'row-card__details--sheet': sheet,
            'row-card__details--card': broken && !sheet,
          }"
          :aria-label="`${pickedBook.title} details`"
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
        </article>
      </Transition>
    </Teleport>
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

/* Broken out: over the whole viewport, above the host's page and its bars (--regal-row-z-index). */
.row-card__view--out {
  position: fixed;
  z-index: var(--regal-row-z-index, 40);
}

.row-card__canvas {
  position: absolute !important;
  inset: 0;
}

/* The dates: the Stack's flat label with its leader line, above the row. */
.row-card__labels .row-label__inner {
  bottom: 0;
  left: 0;
  transform: translateX(-50%);
  font-size: var(--text-xs, 0.7rem);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--color-ink, #2C2C2A);
}

.row-card__labels .row-label__inner::after {
  content: '';
  position: absolute;
  top: calc(100% + 2px);
  left: 50%;
  width: 1px;
  height: max(0px, calc(var(--leader, 0px) - 4px));
  background: var(--color-ink, #2C2C2A);
}

.row-card__labels .row-label__small {
  margin-left: -0.25em;
  font-size: 0.5em;
  font-weight: 600;
  vertical-align: 0.55em;
  line-height: 0;
}

.row-card__labels .row-label__count {
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
  z-index: calc(var(--regal-row-z-index, 40) + 1);
}

.row-card__back:hover {
  color: var(--color-accent, #B93E2E);
}

.row-card__back,
.row-card__details {
  box-sizing: border-box;
  /* Broken out they live in <body>, outside the row: its type comes along. */
  font-family: var(--font-mono, 'IBM Plex Mono', 'Courier New', Courier, monospace);
  line-height: 1.35;
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

/* The details fade as the Book leaves and comes back; it doesn't wait for them. */
.row-fade-enter-active,
.row-fade-leave-active {
  transition: opacity 0.35s ease;
}

.row-fade-enter-from,
.row-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .row-fade-enter-active,
  .row-fade-leave-active {
    transition: none;
  }
}

/* Broken out, narrow: a sheet on the viewport's bottom edge (as RegalBooksStage's). */
.row-card__details--sheet {
  position: fixed;
  right: -1px;
  bottom: -1px;
  left: -1px;
  z-index: calc(var(--regal-row-z-index, 40) + 1);
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
  z-index: calc(var(--regal-row-z-index, 40) + 1);
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
</style>
