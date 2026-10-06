<script setup lang="ts">
// A row of Books inline in a card (RegalBooksRow): the Stack turned 90°,
// oldest on the left, what was read last on the right. It fills its box.
//
// The card is a horizontal scroll container (overflow-x) holding a track as
// wide as the row, the canvas sticky at its left edge. A trackpad or
// Shift+wheel scrolls it natively, arrow keys once focused, the scroll bar,
// a mouse can drag it. A finger swiping sideways drags it too, with a fling
// like the platform's (utils/row/touchDrag.ts: a native touch scroll would
// end in a pointercancel, which keeps the scroll ticks from vibrating until a
// first tap); swiping up or down scrolls the page as usual (touch-action
// pan-y: nothing is trapped). At rest the card is full of Books (rowRest).
// The camera follows scrollLeft, matched so the Spines move with the finger. The dates are HTML, placed each frame from the
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
//
// Theming (RegalBooksRow's theme, unstyled and slots; docs/nuxt-layer.md: "Theming"): the
// card, its dates and buttons, the focus label (the tooltip) and the details
// (the detail panel) read the `--_regal-*` tokens. What moves to <body> on
// break-out (the canvas box with its labels, Back, the details) is a `.regal`
// surface carrying the tokens resolved on RegalBooksRow's root, and the veil
// takes the card's surface colour.
import { ACESFilmicToneMapping, SRGBColorSpace, VSMShadowMap } from 'three'
import gsap from 'gsap'
import { TONE_MAPPING_EXPOSURE } from '#layers/regal/app/utils/bookcase/scene'
import type { Book } from '#layers/regal/shared/types/book'
import { SHELVED } from '#layers/regal/app/utils/books/pick'
import type { PickState } from '#layers/regal/app/utils/books/pick'
import { createRowView } from '#layers/regal/app/utils/row/context'
import type { RowContext } from '#layers/regal/app/utils/row/context'
import type { RowIntroState } from '#layers/regal/app/utils/row/intro'
import { layoutRow, ROW_CAMERA, ROW_LABEL_Y, rowFocusLabelTop, rowLabelPlan, rowLabelReach, rowLabelSlots, rowLabelTexts, rowProject, rowRest, rowScroll } from '#layers/regal/app/utils/row/layout'
import { boostFling, dragAxis, flingAt, followed, releaseVelocity, startFling, trackDrag } from '#layers/regal/app/utils/row/touchDrag'
import type { DragAxis, DragSample, Fling } from '#layers/regal/app/utils/row/touchDrag'
import { backgroundOf, parseCssColor } from '#layers/regal/app/utils/theme/color'
import { floorShadowStrength, ROW_SHEET_TOKENS, VEIL_OPACITY_CARD, VEIL_OPACITY_FULL, veilOpacity } from '#layers/regal/app/utils/theme/tokens'

const props = withDefaults(defineProps<{
  /** The Books, newest first (rowBooks). */
  books: Book[]
  /** Where a picked Book is looked at: in the card, the whole viewport, or by screen width. */
  inspect?: 'card' | 'viewport' | 'auto'
  /** Where the row starts: at what was read last (as the Stack), or at the first Book. */
  start?: 'newest' | 'oldest'
  /** What the row is, for assistive technology ('Books read in 2025'). */
  label?: string
  /** Regal's Back button while a Book is out (the host's #back slot replaces it). */
  backButton?: boolean
  /** Turning a Book taken out: about both axes (a trackball) or the Stage's turntable. */
  rotate?: 'free' | 'turntable'
  /** The Books as a visually hidden list of buttons beside the canvas (RegalBooksRow's `accessible-list`). */
  accessibleList?: boolean
}>(), { inspect: 'card', start: 'newest', label: 'Books read', backButton: true, rotate: 'free', accessibleList: true })

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
  floorShadow: { value: 1 },
  veil: { color: '#F5F2EB', opacity: VEIL_OPACITY_CARD, opacityFull: VEIL_OPACITY_FULL },
  visible: ref(true),
  rotate: computed(() => props.rotate),
  intro: ref<RowIntroState>('waiting'),
  introProgress: { value: 0 },
  introLabels: ref(false),
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

/** Px per metre at the plane the camera looks at: the Spines move with the finger. */
const pxPerMetre = computed(() => (height.value || 300) / ROW_CAMERA.viewHeight)
/**
 * The track has room before the first Book and after the last (rowScroll):
 * the Book in focus is always in the card's middle, the end ones too.
 */
const scroll = computed(() => rowScroll(layout.value, width.value, pxPerMetre.value))
const trackWidth = computed(() => scroll.value.trackWidth)
/** Camera x at scrollLeft 0, and its range. */
const cameraStart = computed(() => scroll.value.cameraStart)
const maxScroll = computed(() => scroll.value.maxScroll)
const scrolls = computed(() => maxScroll.value > 0)

/** Scroll progress 0..1, for the scroll bar. */
const progress = ref(0)
/** True while the row moves and a moment after: the scroll bar wakes. */
const scrolling = ref(false)
let scrollingTimer: ReturnType<typeof setTimeout> | undefined
const scrollerId = useId()

/**
 * At rest the card is full of Books (rowRest): the last Book flush with its
 * right edge (or, for a year row, January's first with its left edge), the
 * Book then in the middle in focus. Set once the card has its size, and again
 * when other Books come in or the card resizes while it still rests (not
 * once the reader scrolled it). The camera follows in the same tick, so the
 * first frame drawn is already the rest.
 */
let started = false
/** The reader has scrolled the row (touch, wheel, a mouse drag, keys, ‹ ›): it stays where they put it. */
let readerScrolled = false
function noteReader() {
  readerScrolled = true
  // The wheel, keys, the scroll bar or a finger take over from a glide.
  stopGlide()
}
const rest = computed(() => rowRest(layout.value, scroll.value, width.value, pxPerMetre.value, props.start))
watch([rest, maxScroll, width], ([left, max, cardWidth]) => {
  const element = scroller.value
  if (!max || !cardWidth || !element || readerScrolled) return
  element.scrollLeft = left
  started = true
  syncCamera()
}, { flush: 'post' })

function syncCamera() {
  const element = scroller.value
  const left = element ? element.scrollLeft : 0
  ctx.view.cameraX = cameraStart.value + left / pxPerMetre.value
  ctx.view.bounds = [cameraStart.value, cameraStart.value + maxScroll.value / pxPerMetre.value]
  progress.value = maxScroll.value ? left / maxScroll.value : 0
  placeLabels()
}

watch([cameraStart, maxScroll, pxPerMetre], () => nextTick(syncCamera), { immediate: true })

/** Mouse travel since the last scroll; a little gives the lead back to hover (as in the Stack). */
let mouseTravel = 0

function onScroll() {
  syncCamera()
  scrolling.value = true
  clearTimeout(scrollingTimer)
  scrollingTimer = setTimeout(() => (scrolling.value = false), 900)
  // The scroll leads: the riffle runs, hover waits until the mouse moves again.
  if (started) {
    ctx.view.scrollLed = true
    mouseTravel = 0
  }
}

function onScrollEnd() {
  // Our own fling sets scrollLeft every frame (a scrollend each time): it ends the ticks itself.
  if (!ctx.view.touching && !touchDrag && !flingFrame) touchScrolling.value = false
}

// A mouse drags the row too (trackpads scroll it natively) and lets it glide
// on a little.
let drag: { x: number, left: number, lastX: number, lastT: number, speed: number } | null = null
let glideFrame = 0

// A finger (or pen) drags the row sideways itself (utils/row/touchDrag.ts):
// the scroller is touch-action pan-y, so Chrome leaves sideways moves to the
// page and an up/down swipe still scrolls the page (and cancels this drag).
// Its pointerup is a user activation, a native scroll's pointercancel is
// not: the scroll ticks work from the first swipe on. A flick flings on
// along Android's curve; a finger on a flinging row stops it (and doesn't
// take a Book out, as with the native scroll).
let touchDrag: { id: number, x: number, y: number, left: number, axis: DragAxis, samples: DragSample[] } | null = null
let fling: { start: number, left: number, curve: Fling } | null = null
let flingFrame = 0

function stopFling() {
  cancelAnimationFrame(flingFrame)
  flingFrame = 0
  fling = null
}

function stopGlide() {
  cancelAnimationFrame(glideFrame)
  glideFrame = 0
  stopFling()
}

/** The fling's speed now (px/s), for a flick that boosts it. */
function flingSpeed(now: number): number {
  return fling ? flingAt(fling.curve, now - fling.start).velocity * Math.sign(fling.curve.distance) : 0
}

function runFling(velocity: number) {
  const element = scroller.value
  const curve = startFling(velocity)
  if (!element || !curve) {
    stopFling()
    if (!ctx.view.touching) touchScrolling.value = false
    return
  }
  fling = { start: performance.now(), left: element.scrollLeft, curve }
  const step = (now: number) => {
    if (!fling || !scroller.value) return
    const at = flingAt(fling.curve, now - fling.start)
    const target = fling.left + at.offset
    scroller.value.scrollLeft = target
    // Done, or stopped at either end of the row.
    if (at.done || target <= 0 || target >= maxScroll.value) {
      stopFling()
      if (!ctx.view.touching) touchScrolling.value = false
      return
    }
    flingFrame = requestAnimationFrame(step)
  }
  touchScrolling.value = true
  cancelAnimationFrame(flingFrame)
  flingFrame = requestAnimationFrame(step)
}

/** Capture phase, before the Books hear the press: a finger on a flinging row only stops it. */
function onPointerDownCapture(event: PointerEvent) {
  ctx.view.caught = false
  if (event.pointerType === 'mouse' || !event.isPrimary || pickedId.value || !scroller.value) return
  ctx.view.caught = !!fling
  stopGlide()
  touchDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: scroller.value.scrollLeft, axis: 'pending', samples: [] }
  trackDrag(touchDrag.samples, event.timeStamp, event.clientX)
}

function onTouchDragMove(event: PointerEvent) {
  if (!touchDrag || event.pointerId !== touchDrag.id || !scroller.value) return
  const dx = event.clientX - touchDrag.x
  if (touchDrag.axis === 'pending') {
    touchDrag.axis = dragAxis(dx, event.clientY - touchDrag.y)
    if (touchDrag.axis === 'x') {
      noteReader()
      ctx.view.scrollLed = true
      touchScrolling.value = true
    }
  }
  if (touchDrag.axis === 'y') return
  // Every position the finger reported since the last frame, for the release speed.
  const moves = event.getCoalescedEvents?.() ?? []
  for (const move of moves.length ? moves : [event]) trackDrag(touchDrag.samples, move.timeStamp, move.clientX)
  if (touchDrag.axis === 'x') scroller.value.scrollLeft = touchDrag.left - followed(dx)
}

function onTouchDragEnd(event: PointerEvent) {
  if (!touchDrag || event.pointerId !== touchDrag.id) return
  const ended = touchDrag
  touchDrag = null
  // Cancelled: the page took an up/down swipe (or the system the touch).
  if (ended.axis !== 'x' || event.type !== 'pointerup' || pickedId.value) {
    if (!ctx.view.touching) touchScrolling.value = false
    return
  }
  const now = performance.now()
  runFling(boostFling(-releaseVelocity(ended.samples, event.timeStamp), flingSpeed(now)))
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || event.button !== 0 || pickedId.value || !scroller.value) return
  noteReader()
  stopGlide()
  drag = { x: event.clientX, left: scroller.value.scrollLeft, lastX: event.clientX, lastT: event.timeStamp, speed: 0 }
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return onTouchDragMove(event)
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

function onPointerUp(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return onTouchDragEnd(event)
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
  if (touching) noteReader()
  ctx.view.touching = touching
  if (touching) ctx.view.scrollLed = true
  if (event.type === 'touchmove') touchScrolling.value = true
  else if (!touching && !touchDrag && !flingFrame) touchScrolling.value = false
}

/**
 * Brings a Book to the card's middle, where the Book in focus is (the camera
 * follows the scroll): the Book list's focus shows it, taking it out starts
 * from there (instantly, the 3D has to find it where it stands).
 */
function centreBook(bookId: string, smooth: boolean) {
  const element = scroller.value
  const pose = layout.value.poses.find(candidate => candidate.bookId === bookId)
  if (!element || !pose) return
  noteReader()
  const left = (pose.x - cameraStart.value) * pxPerMetre.value
  if (smooth && reducedMotion.value !== 'reduce') element.scrollTo({ left, behavior: 'smooth' })
  else {
    element.scrollLeft = left
    syncCamera()
  }
}

/** The Book list's button: the same as Enter on the Book in focus, for any Book. */
function pickFromList(book: Book) {
  if (!pickedId.value) centreBook(book.id, false)
  pick.value = { bookId: book.id, face: 'front' }
}

function scrollStep(direction: number) {
  noteReader()
  scroller.value?.scrollBy({ left: direction * width.value * 0.7, behavior: reducedMotion.value === 'reduce' ? 'auto' : 'smooth' })
}

function onKey(event: KeyboardEvent) {
  noteReader()
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
/**
 * Each date's width (px), measured once it is on the page (again for other
 * dates, other sizes or a late font); until then the plan uses an estimate.
 */
const labelWidths = shallowRef<ReadonlyMap<string, number>>(new Map())
/** The dates that stepped back for a neighbour at the edge, kept between frames for the hysteresis. */
let steppedBack = new Set<string>()

const labelTexts = computed(() => rowLabelTexts(layout.value.markers))
const labels = computed(() => rowLabelPlan(labelTexts.value, labelWidths.value, pxPerMetre.value, props.start))
watch(labelTexts, () => {
  labelWidths.value = new Map()
  nextTick(measureLabels)
})
function measureLabels() {
  const widths = new Map<string, number>()
  for (const [key, element] of labelElements) {
    const width = (element.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0
    if (width) widths.set(key, width)
  }
  const before = labelWidths.value
  const same = widths.size === before.size && [...widths].every(([key, width]) => Math.abs((before.get(key) ?? 0) - width) < 0.5)
  if (!same) labelWidths.value = widths
}
onMounted(() => {
  measureLabels()
  document.fonts?.ready.then(() => measureLabels())
})
/** The focus label stays put: centred across the card, just under the row (rowFocusLabelTop). */
const focusTop = computed(() => `${rowFocusLabelTop(height.value || 300).toFixed(1)}px`)

/**
 * Places the dates where the row's resting camera shows them (rowProject):
 * from the scroll and the card's size only, never the 3D camera, so they
 * hold still while a Book is out, broken out or landing back (they are faded
 * out then, see `datesShown`). On every scroll, resize and change of dates.
 */
function placeLabels() {
  const w = width.value
  const h = height.value
  if (!w || !h) return
  const cameraX = ctx.view.cameraX
  // Where each date's sheet is in the card; the planned dates near it compete for room at its edges.
  const near: { label: typeof labels.value[number], x: number, y: number }[] = []
  for (const label of labels.value) {
    const element = labelElements.get(label.key)
    if (!element) continue
    const { x, y } = rowProject(label.x, ROW_LABEL_Y, cameraX, w, h)
    const off = x < -240 || x > w + 240
    element.style.visibility = off ? 'hidden' : 'visible'
    if (!off) near.push({ label, x, y })
  }
  const slots = rowLabelSlots(
    near.filter(({ label }) => label.shown).map(({ label, x }) => ({ key: label.key, x, width: label.width })),
    w,
    steppedBack,
    rowLabelReach(pxPerMetre.value),
  )
  steppedBack = new Set()
  for (const { label, x, y } of near) {
    const element = labelElements.get(label.key)!
    const slot = slots.get(label.key)
    const shown = label.shown && !!slot?.shown
    if (label.shown && !shown) steppedBack.add(label.key)
    element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    // Out at once (two dates are never on top of each other, not even while one fades), back in softly.
    element.style.setProperty('--shown', shown ? '1' : '0')
    element.style.setProperty('--fade', shown ? '160ms' : '0ms')
    // A date at the card's edge slides in to stay readable; its leader stays on the sheet.
    element.style.setProperty('--nudge', `${(slot?.nudge ?? 0).toFixed(1)}px`)
    // The leader line runs down from the date to the top of the row.
    const top = rowProject(label.x, label.height, cameraX, w, h).y
    element.style.setProperty('--leader', `${Math.max(0, top - y).toFixed(1)}px`)
  }
}
watch([labels, width, height], () => placeLabels(), { flush: 'post' })

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
    // Back in the card first, then the fade (one frame later, so it runs).
    requestAnimationFrame(() => {
      if (!pickedId.value) datesShown.value = true
    })
  }, reducedMotion.value === 'reduce' ? 0 : RETURN_SECONDS * 1000 + 80)
}

/**
 * The dates (and the focus label) show while the row rests: they fade out as
 * a Book comes out and back in once it has landed, in place all the while
 * (placeLabels).
 */
const datesShown = ref(true)

watch(pickedId, (id, previous) => {
  if (id) datesShown.value = false
  if (id && !previous) {
    // A host may have changed its tokens since (a class on its page).
    readTheme()
    if (inspectsInViewport.value) breakOut()
    else gsap.to(ctx.zoom, { value: CARD_ZOOM, duration: reducedMotion.value === 'reduce' ? 0 : OUT_SECONDS, ease: 'power2.inOut', overwrite: true })
  }
  if (!id && previous) {
    const landed = broken.value
      ? undefined
      : () => {
          if (!pickedId.value) datesShown.value = true
        }
    gsap.to(ctx.zoom, { value: 1, duration: reducedMotion.value === 'reduce' ? 0 : RETURN_SECONDS, ease: 'power2.inOut', overwrite: true, onComplete: landed })
    if (broken.value) landBack()
  }
})

// The details as a dialog (RegalBooksRow's details, in the card or broken out): focus goes into it,
// stays in it while it is modal (broken out, with Back), and goes back to the Book's list button
// (or the scroller, the row's Tab stop) when the Book is put away.
const backElement = ref<HTMLElement | null>(null)
const titleId = useId()
useDialogFocus({
  open: () => !!pickedBook.value,
  dialog: caption,
  also: () => [backElement.value],
  modal: () => broken.value,
  fallback: () => scroller.value,
})

/** Touch on the canvas: up/down scrolls the page, sideways the row (its own drag) or a picked Book; broken out, it has the screen. */
const touchAction = computed(() => (broken.value && pickedId.value ? 'none' : 'pan-y'))

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

// The sheet's grabber (shown with --regal-sheet-grabber: block): drag it down to put the Book back.
const { handlers: grabber } = useSheetDrag({
  sheet: caption,
  enabled: () => sheet.value,
  onSettle: (settle) => {
    if (settle === 'dismiss') putAway()
  },
})

// --- Theme ------------------------------------------------------------------------------

const ui = useRegalUi()
/** The host's own head (#detail, #detail-header) has no title of Regal's to name the dialog by. */
const customTitle = computed(() => ui.hasSlot('detail') || ui.hasSlot('detail-header'))
/**
 * Public tokens the row reads as they are: those with its own (smaller)
 * defaults instead of the theme's, the broken-out sheet's (docs/nuxt-layer.md: "The
 * row's sheet") and its z-index. They are carried to <body> along with the
 * resolved ones when set.
 */
const OWN_DEFAULTS = [
  'font-title',
  'style-title',
  'weight-title',
  'tooltip-padding',
  'panel-padding',
  'row-z-index',
  'veil-opacity',
  'veil-opacity-card',
  'veil-color',
  ...ROW_SHEET_TOKENS,
]
const carried = shallowRef<Record<string, string>>({})
function readCarried() {
  if (!root.value) return
  const style = getComputedStyle(root.value)
  const next: Record<string, string> = {}
  for (const name of OWN_DEFAULTS) {
    const value = style.getPropertyValue(`--regal-${name}`).trim()
    if (value) next[`--regal-${name}`] = value
  }
  if (JSON.stringify(next) !== JSON.stringify(carried.value)) carried.value = next
}
/** Broken out, the canvas box, Back and the details live in <body>: they carry the row's tokens. */
const resolved = useRegalSurface(() => broken.value)
const surface = computed(() => (broken.value
  ? { ...resolved.value, style: { ...resolved.value.style, ...carried.value } }
  : resolved.value))

/**
 * The veil behind a Book taken out: `--regal-veil-color` when it is a colour, else the card's surface
 * (transparent when `unstyled`: what shows behind the card); `--regal-veil-opacity-card` (0.72) in the card,
 * `--regal-veil-opacity` (0.9) broken out, 1 being solid. Read from the card, so a host sets them above it.
 */
function readVeil() {
  const style = root.value ? getComputedStyle(root.value) : null
  const asked = style?.getPropertyValue('--regal-veil-color').trim()
  const parsed = asked ? parseCssColor(asked) : null
  ctx.veil.color = parsed && parsed.alpha > 0.01
    ? parsed.hex
    : backgroundOf(root.value, ui.scheme.value === 'dark' ? '#1F1E1B' : '#F5F2EB')
  ctx.veil.opacity = veilOpacity(style?.getPropertyValue('--regal-veil-opacity-card'), VEIL_OPACITY_CARD)
  ctx.veil.opacityFull = veilOpacity(style?.getPropertyValue('--regal-veil-opacity'), VEIL_OPACITY_FULL)
}
/** What the host set may have changed (a class on its page, the theme). */
function readTheme() {
  readVeil()
  readCarried()
}
watch([ui.scheme, ui.unstyled, ui.tokens], readTheme, { flush: 'post' })
// The Books' floor shadow: Regal's in the light theme, none in the dark (--regal-floor-shadow), switching live.
watchEffect(() => {
  ctx.floorShadow.value = floorShadowStrength(ui.tokens.value, ui.scheme.value)
})

function turn() {
  if (pick.value.bookId) pick.value = { bookId: pick.value.bookId, face: pick.value.face === 'front' ? 'back' : 'front' }
}

const readDate = computed(() => {
  const value = pickedBook.value?.dateRead
  if (!value) return pickedBook.value?.status === 'currently-reading' ? 'Reading now' : ''
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
})
/** The line under the title, for the host's #detail-meta. */
const meta = computed(() => [pickedBook.value?.author, readDate.value].filter(Boolean) as string[])
/** The blurb shows on a wide card and broken out. */
const roomy = computed(() => broken.value || wide.value)

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
  // A host's media query may change the veil's tokens.
  window.addEventListener('resize', readVeil, { passive: true })
  syncCamera()
  readTheme()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  stopGlide()
  window.removeEventListener('pointermove', onMouseMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('popstate', onPopState)
  window.removeEventListener('resize', readVeil)
  clearTimeout(landing)
  gsap.killTweensOf(ctx.zoom)
  if (broken.value) document.documentElement.style.overflow = ''
})

const dpr = computed<[number, number]>(() => [1, quality.value.maxDpr])
/** The share of the row the card shows, 0..1: the scroll bar's thumb. */
const share = computed(() => Math.min(1, width.value / Math.max(1, trackWidth.value)))
/** "Book 12 of 77": the Book in focus, for the scroll bar's value text. */
const barText = computed(() => {
  const index = oldestFirst.value.findIndex(book => book.id === ctx.focused.value)
  return index < 0 ? `${oldestFirst.value.length} books` : `Book ${index + 1} of ${oldestFirst.value.length}`
})
/** The reader moves the thumb: the row follows at once. */
function scrub(value: number) {
  const element = scroller.value
  if (!element) return
  noteReader()
  element.scrollLeft = value * maxScroll.value
}
</script>

<template>
  <section
    ref="root"
    class="row-card"
    :class="{ 'row-card--picked': pickedId, 'row-card--wide': wide, [`row-card--intro-${ctx.intro.value}`]: true, 'row-card--intro-hold': !ctx.introLabels.value }"
    :data-picked="pickedId ?? ''"
    :data-book-count="layout.poses.length"
    :aria-label="label"
  >
    <div
      :id="scrollerId"
      ref="scroller"
      class="row-card__scroller"
      tabindex="0"
      role="region"
      :aria-label="`${books.length} books, scroll sideways`"
      @scroll.passive="onScroll"
      @scrollend="onScrollEnd"
      @pointerdown.capture="onPointerDownCapture"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @touchstart.passive="onTouch"
      @touchmove.passive="onTouch"
      @touchend.passive="onTouch"
      @touchcancel.passive="onTouch"
      @keydown="onKey"
      @wheel.passive="noteReader"
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
              v-bind="surface"
              class="row-card__view"
              :class="{ 'row-card__view--out': broken }"
              :aria-hidden="broken && pickedId ? 'true' : undefined"
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
                class="row-card__labels"
                :class="{ 'row-card__labels--hidden': !datesShown || broken }"
                aria-hidden="true"
              >
                <div
                  v-for="item in labels"
                  :key="item.key"
                  :ref="(element: unknown) => setLabel(item.key, element)"
                  class="row-label"
                  :data-shown="item.shown"
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
                  class="row-focus"
                  :style="{ top: focusTop }"
                >
                  <span class="row-focus__inner">
                    <BooksHostSlot
                      name="tooltip"
                      :scope="{ book: focusedBook }"
                    >
                      <BooksTitleStars :book="focusedBook" />
                    </BooksHostSlot>
                  </span>
                </p>
              </div>
            </div>
          </Teleport>
        </div>
      </div>
    </div>

    <!-- The Books for assistive tech: the canvas names none of them. -->
    <BooksAccessibleList
      v-if="props.accessibleList"
      :books="books"
      @pick="pickFromList"
      @focus="book => centreBook(book.id, true)"
    />

    <RowScrollbar
      v-if="scrolls && !pickedId"
      :progress="progress"
      :share="share"
      :scrolling="scrolling"
      :controls="scrollerId"
      :text="barText"
      @scrub="scrub"
    />

    <button
      v-if="scrolls && !pickedId && progress > 0.001"
      type="button"
      class="row-card__arrow row-card__arrow--left"
      aria-label="Scroll left"
      tabindex="-1"
      @click="scrollStep(-1)"
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path d="M10.25 3.5 5.75 8l4.5 4.5" />
      </svg>
    </button>
    <button
      v-if="scrolls && !pickedId && progress < 0.999"
      type="button"
      class="row-card__arrow row-card__arrow--right"
      aria-label="Scroll right"
      tabindex="-1"
      @click="scrollStep(1)"
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path d="M5.75 3.5 10.25 8l-4.5 4.5" />
      </svg>
    </button>

    <Teleport
      to="body"
      :disabled="!broken"
    >
      <!-- The host's own Back (#back), placed where Regal's goes. -->
      <div
        v-if="pickedBook && ui.hasSlot('back')"
        ref="backElement"
        v-bind="surface"
        class="row-card__back-slot"
        :class="{ 'row-card__back-slot--out': broken }"
      >
        <BooksHostSlot
          name="back"
          :scope="{ book: pickedBook, close: putAway, broken }"
        />
      </div>
      <button
        v-else-if="pickedId && props.backButton"
        ref="backElement"
        v-bind="surface"
        type="button"
        class="row-card__back"
        :class="{ 'row-card__back--out': broken }"
        @click="putAway"
      >
        ← Back
      </button>

      <Transition name="row-fade">
        <div
          v-if="pickedBook"
          ref="caption"
          v-bind="surface"
          class="row-card__details"
          :class="{
            'row-card__details--side': !broken && wide,
            'row-card__details--sheet': sheet,
            'row-card__details--card': broken && !sheet,
          }"
          role="dialog"
          tabindex="-1"
          :aria-modal="broken ? 'true' : undefined"
          :aria-labelledby="customTitle ? undefined : titleId"
          :aria-label="customTitle ? `${pickedBook.title} details` : undefined"
        >
          <div
            v-if="sheet"
            class="row-card__grabber"
            aria-hidden="true"
            v-on="grabber"
          >
            <span class="row-card__grabber-bar" />
          </div>
          <!-- The host's whole details (#detail); Regal keeps placing, fading and Back. -->
          <div
            v-if="ui.hasSlot('detail')"
            class="row-card__custom"
          >
            <BooksHostSlot
              name="detail"
              :scope="{ book: pickedBook, close: putAway, flip: turn, face: pick.face, sheet }"
            />
          </div>
          <template v-else>
            <BooksHostSlot
              name="detail-header"
              :scope="{ book: pickedBook }"
            >
              <p
                :id="titleId"
                class="row-card__book-title"
              >
                {{ pickedBook.title }}
              </p>
              <div
                v-if="ui.hasSlot('detail-meta')"
                class="row-card__meta-slot"
              >
                <BooksHostSlot
                  name="detail-meta"
                  :scope="{ book: pickedBook, meta }"
                />
              </div>
              <p
                v-else
                class="row-card__book-meta"
              >
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
            </BooksHostSlot>
            <div
              v-if="roomy && ui.hasSlot('detail-about')"
              class="row-card__about-slot"
            >
              <BooksHostSlot
                name="detail-about"
                :scope="{ book: pickedBook, description: pickedBook.description }"
              />
            </div>
            <p
              v-else-if="roomy && pickedBook.description"
              class="row-card__book-review"
            >
              {{ pickedBook.description }}
            </p>
            <p
              v-if="roomy && pickedBook.review"
              class="row-card__book-review row-card__book-review--own"
            >
              {{ pickedBook.reviewHasSpoiler ? 'Review hidden (spoilers).' : pickedBook.review }}
            </p>
            <div
              v-if="ui.hasSlot('detail-actions')"
              class="row-card__actions-slot"
            >
              <BooksHostSlot
                name="detail-actions"
                :scope="{ book: pickedBook, close: putAway, flip: turn, face: pick.face }"
              />
            </div>
            <p
              v-else
              class="row-card__book-hint"
            >
              <button
                type="button"
                class="row-card__link"
                @click="turn"
              >
                {{ pick.face === 'front' ? 'Turn over' : 'Front' }}
              </button>
              · drag or flick to turn
            </p>
          </template>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
/*
 * The card's own frame: --regal-row-border / -radius / -background turn it off
 * or restyle it alone (e.g. `none`, `0`, `transparent` inside a host's own
 * card); unset, the theme's frame and surface. The veil behind a Book taken
 * out takes this background (transparent: what shows behind the card).
 */
.row-card {
  position: relative;
  overflow: hidden;
  border: var(--regal-row-border, var(--_regal-border-width) solid var(--_regal-border));
  border-radius: var(--regal-row-radius, var(--_regal-radius));
  background: var(--regal-row-background, var(--_regal-surface));
  color: var(--_regal-ink);
  font-family: var(--_regal-font-body);
  font-size: var(--_regal-size-body);
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
  /* Sideways a finger drags the row itself (RowCard): its pointerup lets the scroll ticks vibrate. */
  touch-action: pan-y;
}

.row-card__scroller::-webkit-scrollbar {
  display: none;
}

.row-card__scroller:focus-visible {
  outline: 2px solid var(--_regal-accent);
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
  /* Broken out it lives in <body>: the row's type comes along (the same values in the card). */
  color: var(--_regal-ink);
  font-family: var(--_regal-font-body);
  font-size: var(--_regal-size-body);
  line-height: 1.35;
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
  transform: translateX(calc(-50% + var(--nudge, 0px)));
  font-size: var(--_regal-size-small);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--_regal-ink);
}

.row-card__labels .row-label__inner::after {
  content: '';
  position: absolute;
  top: calc(100% + 2px);
  left: calc(50% - var(--nudge, 0px));
  width: 1px;
  height: max(0px, calc(var(--leader, 0px) - 4px));
  background: var(--_regal-ink);
}

/* A date crowded out by a neighbour steps back to its leader line (at once; it returns with a short fade). */
.row-card__labels .row-label__text,
.row-card__labels .row-label__small,
.row-card__labels .row-label__count {
  opacity: var(--shown, 1);
  transition: opacity var(--fade, 0ms) linear;
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

/* The focus label: in one place, centred across the card under the row (top: rowFocusLabelTop). */
.row-focus {
  position: absolute;
  top: 0;
  right: 12px;
  left: 12px;
  display: flex;
  justify-content: center;
  margin: 0;
}

/* The row's tooltip: the tooltip's tokens, its own (smaller) padding and size by default. */
.row-focus__inner {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  min-width: 0;
  max-width: min(15rem, 100%);
  padding: var(--regal-tooltip-padding, 0.2rem 0.45rem);
  overflow: hidden;
  border: var(--_regal-border-width) solid var(--_regal-border);
  border-radius: var(--_regal-radius);
  background: var(--_regal-surface);
  box-shadow: var(--_regal-shadow);
  backdrop-filter: var(--_regal-backdrop);
  color: var(--_regal-ink);
  font-size: var(--_regal-size-label);
  white-space: nowrap;
}

/* A long title truncates inside the label; the stars stay whole. */
.row-focus__inner :deep(.title-stars__title) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-focus__inner :deep(.title-stars__rating),
.row-focus__inner :deep(.title-stars__unrated) {
  flex-shrink: 0;
}

.row-card__labels {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  /* Back in once the Book has landed (a host's motion tokens, else Libellus' standard). */
  transition:
    opacity var(--duration-standard, 250ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
    transform var(--duration-standard, 250ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

/* Out as a Book comes out (the host's exit, else Libellus'); in place all the while. */
.row-card__labels--hidden {
  opacity: 0;
  transition: opacity var(--duration-exit, 200ms) var(--ease-exit, cubic-bezier(0.4, 0, 1, 1));
}

@media (prefers-reduced-motion: reduce) {
  .row-card__labels,
  .row-card__labels--hidden,
  .row-card__labels .row-label__text,
  .row-card__labels .row-label__small,
  .row-card__labels .row-label__count {
    transition: none;
  }
}

/* The row's intro (utils/row/intro.ts): the dates with their leader lines, the
   focus label, the scroll bar and the ‹ › wait unseen while the Books settle
   (they are in the first frames, before the Books have arrived, otherwise). */
.row-card--intro-hold .row-card__labels,
.row-card--intro-hold .row-bar {
  opacity: 0;
  transform: translateY(3px);
  transition: none;
}

.row-card--intro-hold .row-card__arrow {
  visibility: hidden;
}

/* Then they fade in (opacity and a 3 px rise, the row's motion tokens) in the
   intro's last moment (INTRO_LABELS_OVERLAP), at once when there is no intro.
   The dates, leader lines and the focus label share the labels' layer; the
   scroll bar gets the same fade. */
.row-bar {
  transition:
    opacity var(--duration-standard, 250ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
    transform var(--duration-standard, 250ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

@media (prefers-reduced-motion: reduce) {
  .row-bar {
    transition: none;
  }
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
  font-size: var(--_regal-size-label);
  letter-spacing: var(--_regal-label-tracking);
  text-transform: var(--_regal-label-case);
}

.row-label__count {
  color: var(--_regal-accent);
}

.row-card__arrow {
  position: absolute;
  top: 50%;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  margin: -1rem 0 0;
  padding: 0;
  border: var(--_regal-border-width) solid var(--_regal-border);
  border-radius: var(--_regal-radius-control);
  background: var(--_regal-surface);
  color: var(--_regal-ink);
  line-height: 0;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, color 0.15s, transform 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.row-card__arrow svg {
  display: block;
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.row-card:hover .row-card__arrow {
  opacity: 0.85;
}

.row-card:hover .row-card__arrow:hover {
  color: var(--_regal-accent);
  opacity: 1;
}

.row-card__arrow:active {
  transform: scale(0.94);
}

.row-card__arrow--left {
  left: 0.5rem;
}

.row-card__arrow--right {
  right: 0.5rem;
}

@media (pointer: coarse) {
  .row-card__arrow {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .row-card__arrow {
    transition: none;
  }
}

.row-card__back {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 3;
  padding: 0.3rem 0.6rem;
  border: var(--_regal-border-width) solid var(--_regal-border);
  border-radius: var(--_regal-radius-control);
  background: var(--_regal-surface);
  color: var(--_regal-ink);
  font: inherit;
  font-size: var(--_regal-size-label);
  letter-spacing: var(--_regal-label-tracking);
  text-transform: var(--_regal-label-case);
  cursor: pointer;
}

.row-card__back--out {
  position: fixed;
  top: 0.8rem;
  left: 0.8rem;
  z-index: calc(var(--regal-row-z-index, 40) + 1);
}

/* The host's Back (#back): only placed, its look is the host's. */
.row-card__back-slot {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 3;
}

.row-card__back-slot--out {
  position: fixed;
  top: 0.8rem;
  left: 0.8rem;
  z-index: calc(var(--regal-row-z-index, 40) + 1);
}

.row-card__back:hover {
  color: var(--_regal-accent);
}

.row-card__back,
.row-card__details {
  box-sizing: border-box;
  /* Broken out they live in <body>, outside the row: its type comes along. */
  font-family: var(--_regal-font-body);
  line-height: 1.35;
}

.row-card__details {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  padding: 0.5rem 0.7rem 0.55rem;
  border-top: var(--_regal-border-width) solid var(--_regal-border);
  background: var(--_regal-surface-raised);
  color: var(--_regal-ink);
}

.row-card__details--side {
  top: 0;
  left: auto;
  width: 40%;
  padding: 0.8rem 0.9rem;
  border-top: 0;
  border-left: var(--_regal-border-width) solid var(--_regal-border);
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

/*
 * Broken out, narrow: a sheet on the viewport's bottom edge (as RegalBooksStage's).
 * The host can make it its own (docs/nuxt-layer.md: "The row's sheet"): --regal-sheet-*
 * tokens for its frame, padding (0: a #detail slot fills it edge to edge),
 * width and the grabber; unset, today's look.
 */
.row-card__details--sheet {
  position: fixed;
  right: -1px;
  bottom: -1px;
  left: -1px;
  z-index: calc(var(--regal-row-z-index, 40) + 1);
  max-width: var(--regal-sheet-max-width, none);
  max-height: var(--regal-sheet-max-height, 34dvh);
  margin: 0 auto;
  padding: var(--regal-sheet-padding, 0.8rem 1rem 1rem);
  border: var(--regal-sheet-border, var(--_regal-border-width) solid var(--_regal-border));
  border-radius: var(--regal-sheet-radius, var(--_regal-radius)) var(--regal-sheet-radius, var(--_regal-radius)) 0 0;
  background: var(--regal-sheet-background, var(--_regal-surface-raised));
  box-shadow: var(--regal-sheet-shadow, var(--_regal-shadow));
  backdrop-filter: var(--_regal-backdrop);
  overflow-y: auto;
  font-size: var(--_regal-size-body);
}

/* The grabber: hidden unless the host shows it; drag it down to put the Book back. */
.row-card__grabber {
  position: relative;
  display: var(--regal-sheet-grabber, none);
  height: 1.1rem;
  touch-action: none;
  cursor: grab;
}

.row-card__grabber-bar {
  position: absolute;
  top: 0.4rem;
  left: 50%;
  width: var(--regal-sheet-grabber-width, 2.25rem);
  height: var(--regal-sheet-grabber-height, 2px);
  border-radius: 999px;
  background: var(--regal-sheet-grabber-color, var(--_regal-ink-faint));
  transform: translateX(-50%);
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
  padding: var(--regal-panel-padding, 0.9rem 1rem);
  border: var(--_regal-border-width) solid var(--_regal-border);
  border-radius: var(--_regal-radius);
  box-shadow: var(--_regal-shadow);
  backdrop-filter: var(--_regal-backdrop);
  overflow-y: auto;
  font-size: var(--_regal-size-body);
}

/* The dialog takes focus as a whole (so its name is read), it is not a control: no ring around it. */
.row-card__details:focus {
  outline: none;
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

/* The title keeps the row's type unless the host sets the title tokens. */
.row-card__book-title {
  font-family: var(--regal-font-title, inherit);
  font-style: var(--regal-style-title, normal);
  font-weight: var(--regal-weight-title, 600);
  font-size: var(--_regal-size-body);
}

.regal--unstyled .row-card__book-title {
  font-family: inherit;
  font-style: inherit;
}

.row-card__book-meta,
.row-card__book-hint {
  color: var(--_regal-ink-muted);
  font-size: var(--_regal-size-label);
}

.row-card__meta-slot,
.row-card__actions-slot {
  margin-top: 0.25rem;
}

.row-card__about-slot {
  margin-top: 0.5rem;
}

.row-card__book-review {
  margin-top: 0.5rem !important;
  font-size: var(--_regal-size-label);
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
  color: var(--_regal-accent);
  font: inherit;
  cursor: pointer;
}
</style>

<style src="../../assets/css/regal-theme.css"></style>
