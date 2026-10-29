<script setup lang="ts">
// A Reel in a card (RegalBooksReel), libellus plan section H, variation A:
// the Books on the prototype's arc (ReelScene), the host's pills and caption
// under the front Book (#tooltip, faded with the beat), the dots and the
// pause button. It plays once per visit when it first comes into view (one
// beat every 3.2 s: a 0.8 s move, a 2.4 s hold), rests off screen and in a
// hidden tab, and stops on its round's last Book. The state machine is
// utils/reel/state.ts; this card feeds it the clock, the finger and the keys.
//
// Manual takeover: a sideways drag past the slop (it follows the finger 1:1,
// a flick glides and snaps to a Book, a tick per Book on Android), a tap,
// the arrow keys or the pause button stop the auto-play for this visit; only
// Play starts it again. An up/down swipe scrolls the page.
//
// Detail, as the Stack: a tap on the Book in front (also while it plays)
// breaks the canvas out over the viewport (the row's break-out, same pixels
// where the card is, the page veiled and still), the Book comes to the
// Inspect pose, the Stack's details open (BooksDetails: a sheet on a phone,
// ≤ 560 px; its card at the bottom right wider), the caption morphs into the
// details' title, haptics. Show back / Put back / drag the sheet down / tap
// beside / Escape / the system Back put the Book back into its place;
// Open book emits `open` and puts it back at once. Reduce Motion: no
// auto-play, no dolly, no flight. The reel's own Pick (RegalBooksReel
// provides it): a Book out here is out nowhere else.
import { NoToneMapping, SRGBColorSpace } from 'three'
import { TONE_MAPPING_EXPOSURE } from '#layers/regal/app/utils/bookcase/scene'
import type { Book } from '#layers/regal/shared/types/book'
import type { AssetFaces } from '#layers/regal/app/utils/covers/bookAssets'
import { sheetMaxHeight, showsSheet } from '#layers/regal/app/utils/books/sheet'
import { backgroundOf, parseCssColor } from '#layers/regal/app/utils/theme/color'
import { floorShadowStrength, VEIL_OPACITY_FULL, veilOpacity } from '#layers/regal/app/utils/theme/tokens'
import { dragAxis, dragFocus, releaseVelocity, trackDrag } from '#layers/regal/app/utils/reel/drag'
import type { DragAxis, DragSample } from '#layers/regal/app/utils/reel/drag'
import { advance, badgeOpacity, canAutoPlay, closeDetail, dragTo, frontFocus, initialReel, newVisit, openDetail, pauseControl, play, reelStartFrame, release, setReduced, setVisible, settleOnBook, step, takeOver, tapBook } from '#layers/regal/app/utils/reel/state'
import type { ReelMode, ReelState } from '#layers/regal/app/utils/reel/state'
import { REEL_BADGE_OUT, REEL_EASE, REEL_MOVE, reelMoveClock, seg } from '#layers/regal/app/utils/reel/timeline'
import { fillLabel, jumpOffset, REEL_LABELS, REEL_STAGE_HEIGHT, reelShownIndex, rubberFocus, settleOffset } from '#layers/regal/app/utils/reel/scene'
import type { ReelLabels, ReelSettle } from '#layers/regal/app/utils/reel/scene'
import type { ReelBookEvent, ReelContext } from '#layers/regal/app/utils/reel/context'

const props = withDefaults(defineProps<{
  /** The Books, in the reel's order (the Library's). */
  books: Book[]
  /** A Book's faces from the reel's own Library. */
  facesOf: (bookId: string) => AssetFaces | null
  /** What the reel is, for assistive technology. */
  label?: string
  /** The words Regal shows or reads out (RegalBooksReel's `labels`). */
  labels?: Partial<ReelLabels>
  /** Reduce Motion: true/false overrides `prefers-reduced-motion`; undefined follows it. */
  reducedMotion?: boolean
  /** Plays once when it first shows (false: it starts still, Play starts it). */
  autoplay?: boolean
  /** Turning a Book taken out: freely (a trackball) or the Stage's turntable. */
  rotate?: 'free' | 'turntable'
  /** The Books as a visually hidden list of buttons beside the canvas. */
  accessibleList?: boolean
  /** Its own first frame stands in (the poster) until the canvas has taken over. */
  poster?: boolean
  /** Mounts the canvas this many ms later than it would (to look at the poster). */
  canvasDelay?: number
}>(), { label: '', labels: () => ({}), reducedMotion: undefined, autoplay: true, rotate: 'turntable', accessibleList: true, poster: true, canvasDelay: 0 })

const emit = defineEmits<{
  /** The canvas has taken over: its first frame with the faces in view is drawn and fades in over the poster. */
  ready: []
  /** Another Book is in front (the beat, a swipe, a key, a tap). */
  focus: [event: ReelBookEvent]
  /** The reader took over: the auto-play stopped for this visit. */
  manual: []
  /** Open book in the details: the Book was put back at once. */
  open: [event: ReelBookEvent]
}>()

const words = computed<ReelLabels>(() => ({ ...REEL_LABELS, ...props.labels }))
const n = computed(() => props.books.length)

const root = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const focusElement = ref<HTMLElement | null>(null)
const { height: stageHeight } = useElementSize(stage)
const { width: viewportWidth, height: viewportHeight } = useWindowSize()
const quality = useRenderQuality()
const mediaReduced = usePreferredReducedMotion()
const reduced = computed(() => props.reducedMotion ?? mediaReduced.value === 'reduce')

const { pickedId, pick, putAway, flip, face } = useBookPick()
const morph = useLabelMorph()

// --- The state machine ---------------------------------------------------------------

/** The reel before it shows: still, where its first round will begin (so it doesn't jump when it starts). */
function initialState(): ReelState {
  return initialReel(n.value, { reduced: reduced.value, autoplay: props.autoplay })
}

let state: ReelState = initialState()
let settle: ReelSettle | null = null
/** The mode and the Book shown, for the template (they change a few times a minute). */
const mode = ref<ReelMode>(state.mode)
const shown = ref(reelShownIndex(frontFocus(state), n.value, false))
const shownBook = computed(() => props.books[shown.value] ?? null)
/** The Book nearest the front, for the haptic ticks while a finger moves the reel. */
const frontId = ref<string | null>(null)
const touchScrolling = ref(false)
let lastBadge = -1
/** What the live region reads out: the Book in front once the reel rests on it in Manual. */
const announced = ref('')
/** The first frame with the faces in view is drawn: the canvas fades in. */
const ready = ref(false)
/** The canvas is mounted (a task after the card, see onMounted). */
const canvasUp = ref(false)
let canvasTimer: ReturnType<typeof setTimeout> | undefined

// --- The first frame (the poster) and its handover to the canvas ---------------------------
// Until the canvas has drawn its first frame the reel's own poster shows it (components/reel/Poster.vue:
// the same Books at the same places, the same camera). The canvas fades in over it (`ready`), and only
// when that is done does the poster go and the clock run (`handed`): the intro, the arc's first
// move (the last Book swings in from the right, 0.8 s on `standard`) and the dolly, starts from the very
// frame the poster stood in. Held till then, the beat can't have moved the arc under the poster.
const HANDOVER_MS = 300
const start = reelStartFrame(n.value, { reduced: reduced.value, autoplay: props.autoplay })
/** What the poster draws: the live arc and dolly (they change before the handover only by the reader's hand). */
const posterFocus = ref(start.focus)
const posterTime = ref(start.dolly)
const posterOn = ref(true)
const handed = ref(false)
let handoverTimer: ReturnType<typeof setTimeout> | undefined

function handOver() {
  clearTimeout(handoverTimer)
  handoverTimer = setTimeout(() => {
    posterOn.value = false
    handed.value = true
  }, reduced.value ? 0 : HANDOVER_MS)
}

const ctx: ReelContext = {
  focus: { value: frontFocus(state) },
  dolly: { value: start.dolly },
  stageHeight: { value: REEL_STAGE_HEIGHT },
  tick,
  tap,
  caught: { value: false },
  breakout: reactive({ active: false, rect: { left: 0, top: 0, width: 0, height: 0 } }),
  visible: ref(false),
  dim: { value: 0 },
  floorShadow: { value: 1 },
  veil: { color: '#F5F2EB', opacity: VEIL_OPACITY_FULL },
  instantReturn: { value: false },
  rotate: computed(() => props.rotate),
  reduced,
  facesOf: id => props.facesOf(id),
  facesReady: { value: false },
  ready: () => {
    ready.value = true
    emit('ready')
    handOver()
  },
}
watch(stageHeight, (height) => {
  if (height && !ctx.breakout.active) ctx.stageHeight.value = height
}, { immediate: true })

/** Where the arc shows now: the state's position, eased over a jump. */
function liveFocus(now: number): number {
  const offset = settleOffset(settle, now)
  if (!offset) settle = null
  return frontFocus(state) + offset
}

/**
 * The pills' and caption's opacity. While the first frame stands (the poster, the clock held) they
 * are the front Book's, in full; the intro takes them out over `exit` as the arc starts to move (the
 * prototype opens with them out, the poster shows them): from then on the beat's.
 */
let opening = true
function openingBadge(): number {
  if (!opening) return badgeOpacity(state)
  if (state.mode !== 'playing') {
    if (handed.value) opening = false
    return badgeOpacity(state)
  }
  if (!handed.value) return 1
  if (state.elapsed >= REEL_BADGE_OUT) {
    opening = false
    return badgeOpacity(state)
  }
  return 1 - REEL_EASE.exit(seg(state.elapsed, 0, REEL_BADGE_OUT))
}

/** Every frame (ReelScene), and after every event: the clock, then what the page shows. */
function tick(ms: number, now: number) {
  // The clock waits for the handover: the canvas shows the poster's frame first.
  state = advanceState(state, handed.value ? ms : 0)
  update(now)
}

function advanceState(current: ReelState, ms: number): ReelState {
  // advance() leaves the state as it is when nothing runs (no allocation then).
  return current.mode === 'detail' ? current : advance(current, ms)
}

function update(now: number) {
  const focus = liveFocus(now)
  ctx.focus.value = focus
  if (posterOn.value) {
    posterFocus.value = focus
    posterTime.value = ctx.dolly.value
  }
  const playing = state.mode === 'playing'
  if (playing && state.visible && !reduced.value) {
    const clock = state.origin + state.elapsed
    // Phones move the camera only while the arc moves: a hold draws no frame.
    ctx.dolly.value = quality.value.tier === 'mobile' ? reelMoveClock(clock) : clock
  }
  if (mode.value !== state.mode) mode.value = state.mode
  const count = n.value
  const index = reelShownIndex(focus, count, playing)
  if (count && shown.value !== index) {
    shown.value = index
    const book = props.books[index]
    if (book) emit('focus', { id: book.id, index, book })
  }
  const front = count ? props.books[reelShownIndex(focus, count, false)]?.id ?? null : null
  if (frontId.value !== front) frontId.value = front
  if (touchScrolling.value && !drag && !state.glide) touchScrolling.value = false
  // Read out once the reel has come to rest on a Book (not every Book a swipe passes).
  if (state.mode === 'manual' && !drag && !state.glide && !settle && announced.value !== slideText.value) announced.value = slideText.value
  // The pills and caption fade with the beat: straight on the element, no render.
  const badge = Math.round(openingBadge() * 1000) / 1000
  const element = focusElement.value
  if (element && badge !== lastBadge) {
    lastBadge = badge
    element.style.setProperty('--regal-reel-badge', String(badge))
  }
}

/**
 * A new state from an event. `from`: where the arc showed before a jump (a
 * tap, a key): what shows eases from there. `user`: the reader did it (a
 * takeover of Playing emits `manual`).
 */
function commit(next: ReelState, options: { from?: number, user?: boolean } = {}) {
  const now = performance.now()
  if (options.from !== undefined && !reduced.value) {
    const offset = jumpOffset(options.from, frontFocus(next), next.n)
    settle = Math.abs(offset) > 1e-3 ? { offset, start: now, duration: REEL_MOVE * Math.min(1, Math.max(0.4, Math.abs(offset))) } : null
  }
  else if (options.from !== undefined) {
    settle = null
  }
  const tookOver = options.user && state.mode === 'playing' && next.mode !== 'playing'
  state = next
  update(now)
  if (tookOver) emit('manual')
}

// A new Library: a new reel.
watch(() => props.books, () => {
  if (pickedId.value) putAway()
  state = initialState()
  opening = !handed.value
  settle = null
  ctx.facesReady.value = false
  applyVisibility()
  update(performance.now())
})

watch(reduced, value => commit(setReduced(state, value)))

// --- Taps, keys, the pause button ----------------------------------------------------------

/** A press on the canvas ended where it began (ReelBooks): on Book `index`, or beside every Book (-1). */
function tap(index: number) {
  if (pickedId.value || state.mode === 'detail') return
  const from = ctx.focus.value
  if (index < 0) {
    // Beside the Books: a takeover that opens nothing and rests on the nearest Book.
    commit(settleOnBook(state), { from, user: true })
    return
  }
  const next = tapBook(state, index)
  commit(next, { from, user: true })
  if (next.mode === 'detail') {
    const book = props.books[index]
    if (book) pick(book.id)
  }
}

function frontIndexNow(): number {
  return reelShownIndex(ctx.focus.value, n.value, false)
}

function onKey(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey || pickedId.value) return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    commit(step(state, event.key === 'ArrowLeft' ? -1 : 1), { from: ctx.focus.value, user: true })
  }
  else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    tap(frontIndexNow())
  }
}

const autoPlays = computed(() => canAutoPlay({ n: n.value, reduced: reduced.value }))
const control = computed(() => (mode.value === 'playing' ? 'pause' : 'play'))
function togglePlay() {
  if (pauseControl(state) === 'pause') commit(settleOnBook(state), { from: ctx.focus.value, user: true })
  else commit(play(state))
}

// --- A finger or a mouse drags the arc -------------------------------------------------

let drag: { id: number, x: number, y: number, axis: DragAxis, start: number, samples: DragSample[] } | null = null

function onPointerDown(event: PointerEvent) {
  ctx.caught.value = false
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || pickedId.value || ctx.breakout.active || n.value < 1) return
  // A finger on a gliding reel catches it where it is (no Book comes out).
  if (state.glide) {
    ctx.caught.value = true
    commit(takeOver(state))
  }
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: 'pending', start: 0, samples: [] }
  trackDrag(drag.samples, event.timeStamp, event.clientX)
}

function onPointerMove(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return
  const dx = event.clientX - drag.x
  if (drag.axis === 'pending') {
    drag.axis = dragAxis(dx, event.clientY - drag.y)
    if (drag.axis === 'x') {
      // A registered swipe: Manual, the arc caught where it shows.
      const from = ctx.focus.value
      settle = null
      commit(dragTo(takeOver(state), from), { user: true })
      drag.start = from
      touchScrolling.value = true
    }
  }
  if (drag.axis !== 'x') return
  const moves = event.getCoalescedEvents?.() ?? []
  for (const move of moves.length ? moves : [event]) trackDrag(drag.samples, move.timeStamp, move.clientX)
  commit(dragTo(state, rubberFocus(dragFocus(drag.start, dx), n.value)))
}

function onPointerUp(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return
  const ended = drag
  drag = null
  // A catch that never became a swipe (and opens nothing): it rests on the nearest Book.
  if (ended.axis !== 'x') {
    if (ctx.caught.value) commit(settleOnBook(state), { from: ctx.focus.value })
    return
  }
  // Cancelled (the page took the swipe): it snaps where it is.
  const velocity = event.type === 'pointerup' ? releaseVelocity(ended.samples, event.timeStamp) : 0
  const released = release(state, reduced.value ? 0 : velocity)
  // Reduce Motion: no glide, it snaps to the nearest Book.
  commit(reduced.value && released.glide ? dragTo(released, released.glide.glide.to) : released)
}

// --- A Book out ------------------------------------------------------------------------

const broken = ref(false)
const sheet = computed(() => showsSheet(viewportWidth.value))
const sheetHeight = computed(() => sheetMaxHeight({ stageHeight: viewportHeight.value, stageBottom: viewportHeight.value, viewportHeight: viewportHeight.value }))
const RETURN_MS = 800
let landing: ReturnType<typeof setTimeout> | undefined

function breakOut() {
  const box = stage.value?.getBoundingClientRect()
  if (!box) return
  clearTimeout(landing)
  ctx.breakout.rect = { left: box.left, top: box.top, width: box.width, height: box.height }
  broken.value = true
  ctx.breakout.active = true
  // The page stays put under the open Book (the card's place on screen is the camera's).
  document.documentElement.style.overflow = 'hidden'
}

function landBack() {
  clearTimeout(landing)
  const instant = reduced.value || ctx.instantReturn.value
  landing = setTimeout(() => {
    ctx.instantReturn.value = false
    if (pickedId.value) return
    ctx.breakout.active = false
    broken.value = false
    document.documentElement.style.overflow = ''
  }, instant ? 0 : RETURN_MS + 80)
}

// Back (the browser's, Android's) puts the Book back: a history entry while it is out.
let pushed = false
/** Open book waits for that entry to go before it tells the host (who may push a page). */
let pendingOpen: ReelBookEvent | null = null
let openTimer: ReturnType<typeof setTimeout> | undefined

function sendOpen() {
  clearTimeout(openTimer)
  const event = pendingOpen
  pendingOpen = null
  if (event) emit('open', event)
}

watch(pickedId, (id, previous) => {
  if (id) {
    // Taken out another way (the Book list, a host): it comes to the front first.
    if (state.mode !== 'detail') {
      const index = props.books.findIndex(book => book.id === id)
      if (index >= 0) commit(openDetail(tapBook(state, index)), { user: true })
    }
    if (!previous) {
      readTheme()
      breakOut()
      if (!pushed) {
        history.pushState({ ...history.state, regalReelPick: true }, '')
        pushed = true
      }
    }
    return
  }
  if (!previous) return
  commit(closeDetail(state))
  landBack()
  if (pushed) {
    pushed = false
    if (history.state?.regalReelPick) {
      history.back()
      // The host hears of Open book once the entry is gone (popstate), or soon anyway.
      if (pendingOpen) openTimer = setTimeout(sendOpen, 400)
      return
    }
  }
  sendOpen()
})

function onPopState() {
  if (pendingOpen) {
    sendOpen()
    return
  }
  if (!pushed) return
  pushed = false
  putAway()
}

function onWindowKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && pickedId.value) putAway()
}

/** Open book (the details' action): tell the host, the Book back at once. */
function openBook() {
  const id = pickedId.value
  const index = id ? props.books.findIndex(book => book.id === id) : -1
  const book = props.books[index]
  if (!id || !book) return
  pendingOpen = { id, index, book }
  ctx.instantReturn.value = true
  putAway()
}

/** The Book list's button: the same as a tap on that Book in front. */
function pickFromList(book: Book) {
  pick(book.id)
}

// The details' default actions in the reel: Show back / Put back / Open book (RegalBooksReel passes them as `detail-actions`).
defineExpose({ openBook, flip, putAway, face })

// The caption under the front Book is the label the details grow out of (composables/useLabelMorph.ts).
useLabelMorphLabel('focus', () => (focusElement.value && shownBook.value ? { bookId: shownBook.value.id, el: focusElement.value } : null))
const captionHeld = computed(() => morph.value.labelsHidden || !!pickedId.value)

// Haptics: out and back, and a tick per Book while a finger moves the reel (utils/books/haptics.ts).
useBookHaptics({ pickedId, focusedBook: frontId, touchScrolling })

// --- Theme -----------------------------------------------------------------------------

const ui = useRegalUi()
/** Broken out the canvas lives in <body>: it carries the reel's tokens. */
const surface = useRegalSurface(() => broken.value)

/** The veil behind a Book taken out: --regal-veil-color, else the surface behind the reel; --regal-veil-opacity (0.9). */
function readTheme() {
  const style = root.value ? getComputedStyle(root.value) : null
  const asked = style?.getPropertyValue('--regal-veil-color').trim()
  const parsed = asked ? parseCssColor(asked) : null
  ctx.veil.color = parsed && parsed.alpha > 0.01
    ? parsed.hex
    : backgroundOf(root.value, ui.scheme.value === 'dark' ? '#1F1E1B' : '#F5F2EB')
  ctx.veil.opacity = veilOpacity(style?.getPropertyValue('--regal-veil-opacity'), VEIL_OPACITY_FULL)
}
watch([ui.scheme, ui.unstyled, ui.tokens], readTheme, { flush: 'post' })
/** The floor shadows' strength: 1 in the light theme, 0 in the dark (the canvas's and the poster's). */
const shadowStrength = computed(() => floorShadowStrength(ui.tokens.value, ui.scheme.value))
watchEffect(() => {
  ctx.floorShadow.value = shadowStrength.value
})

// --- Visibility ------------------------------------------------------------------------

/** On screen at all (frames are drawn), and enough of it to play (a third). */
let intersecting = false
let enough = false
let active = true
let observer: IntersectionObserver | null = null
const PLAY_SHARE = 0.35

function applyVisibility() {
  if (!import.meta.client) return
  const hidden = document.visibilityState === 'hidden' || !active
  ctx.visible.value = (intersecting || broken.value) && !hidden
  const visible = enough && !hidden
  if (state.visible !== visible) commit(setVisible(state, visible))
}
watch(broken, applyVisibility)

function onVisibilityChange() {
  applyVisibility()
}

onMounted(() => {
  // The 3D (the renderer, three's setup) comes up in a task of its own, after the card's hydration.
  canvasTimer = setTimeout(() => (canvasUp.value = true), props.canvasDelay)
  observer = new IntersectionObserver(([entry]) => {
    intersecting = !!entry?.isIntersecting
    enough = intersecting && (entry!.intersectionRatio >= PLAY_SHARE || entry!.intersectionRect.height >= window.innerHeight * PLAY_SHARE)
    applyVisibility()
  }, { threshold: [0, PLAY_SHARE, 0.6, 1] })
  if (root.value) observer.observe(root.value)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('popstate', onPopState)
  window.addEventListener('keydown', onWindowKey)
  readTheme()
  update(performance.now())
})

// Kept alive (a host's cached page): still and drawing nothing while away; a new visit when back.
onDeactivated(() => {
  active = false
  if (pickedId.value) putAway()
  applyVisibility()
})
onActivated(() => {
  if (active) return
  active = true
  state = newVisit(state)
  applyVisibility()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('popstate', onPopState)
  window.removeEventListener('keydown', onWindowKey)
  clearTimeout(canvasTimer)
  clearTimeout(handoverTimer)
  clearTimeout(landing)
  clearTimeout(openTimer)
  if (broken.value) document.documentElement.style.overflow = ''
  // Gone with a Book out: its history entry goes too (else Back would first land on nothing).
  if (pushed && history.state?.regalReelPick) history.back()
  pushed = false
})

// --- Template bits ---------------------------------------------------------------------

const dpr = computed<[number, number]>(() => [1, quality.value.maxDpr])
const touchAction = computed(() => (pickedId.value && broken.value ? 'none' : 'pan-y'))
const slideText = computed(() => {
  const book = shownBook.value
  if (!book) return ''
  const position = fillLabel(words.value.slide, { n: shown.value + 1, count: n.value })
  return [position, book.title, book.author].filter(Boolean).join(', ')
})
const keysId = useId()
/** Up to this many Books a dot each (the prototype's twelve); more: a count. */
const MAX_DOTS = 24
const ariaLabel = computed(() => props.label || words.value.reel)
</script>

<template>
  <section
    ref="root"
    class="reel-card"
    :class="{ 'reel-card--picked': pickedId, 'reel-card--ready': ready }"
    aria-roledescription="carousel"
    :aria-label="ariaLabel"
    :data-mode="mode"
    :data-front="shown"
    :data-picked="pickedId ?? ''"
    :data-book-count="books.length"
  >
    <div
      ref="stage"
      class="reel-card__stage"
      tabindex="0"
      role="group"
      aria-roledescription="slide"
      :aria-label="slideText"
      :aria-describedby="keysId"
      @keydown="onKey"
    >
      <!-- Its own first frame, under the canvas: the same Books where the canvas will draw them. -->
      <ReelPoster
        v-if="poster && posterOn"
        :books="books"
        :faces-of="facesOf"
        :focus="posterFocus"
        :time="posterTime"
        :shadow="shadowStrength"
      />
      <Teleport
        to="body"
        :disabled="!broken"
      >
        <div
          v-bind="surface"
          class="reel-card__view"
          :class="{ 'reel-card__view--out': broken, 'reel-card__view--ready': ready, 'reel-card__view--still': reduced }"
          :style="{ touchAction }"
          :aria-hidden="broken && pickedId ? 'true' : undefined"
          @pointerdown="onPointerDown"
        >
          <ClientOnly>
            <TresCanvas
              v-if="canvasUp"
              class="reel-card__canvas"
              :alpha="true"
              :clear-alpha="0"
              :premultiplied-alpha="true"
              :tone-mapping="NoToneMapping"
              :tone-mapping-exposure="TONE_MAPPING_EXPOSURE"
              :output-color-space="SRGBColorSpace"
              :dpr="dpr"
            >
              <ReelScene
                :books="books"
                :ctx="ctx"
              />
            </TresCanvas>
          </ClientOnly>
        </div>
      </Teleport>
    </div>

    <!-- Under the front Book: the host's pills and caption (#tooltip), faded with the beat. -->
    <div
      ref="focusElement"
      class="reel-card__focus"
      :class="{ 'reel-card__focus--held': captionHeld }"
    >
      <BooksHostSlot
        v-if="shownBook"
        name="tooltip"
        :scope="{ book: shownBook, index: shown, count: books.length }"
      >
        <ReelCaption :book="shownBook" />
      </BooksHostSlot>
    </div>

    <div class="reel-card__controls">
      <div
        v-if="books.length > 1 && books.length <= MAX_DOTS"
        class="reel-card__dots"
        aria-hidden="true"
      >
        <i
          v-for="(book, index) in books"
          :key="book.id"
          :class="{ 'reel-card__dot--on': index === shown }"
          class="reel-card__dot"
        />
      </div>
      <p
        v-else-if="books.length > MAX_DOTS"
        class="reel-card__count"
        aria-hidden="true"
      >
        {{ shown + 1 }} / {{ books.length }}
      </p>
      <!-- WCAG 2.2.2: anything that moves on its own beside other content can be paused. -->
      <button
        v-if="autoPlays"
        type="button"
        class="reel-card__pause"
        :aria-label="control === 'pause' ? words.pause : words.play"
        :data-control="control"
        @click="togglePlay"
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path
            v-if="control === 'pause'"
            d="M5 3.5v9M11 3.5v9"
          />
          <path
            v-else
            d="M5.5 3.2v9.6L12.8 8z"
            class="reel-card__play"
          />
        </svg>
      </button>
    </div>

    <p
      :id="keysId"
      class="regal-visually-hidden"
    >
      {{ words.keys }}
    </p>
    <p
      class="regal-visually-hidden"
      :aria-live="mode === 'playing' ? 'off' : 'polite'"
    >
      {{ mode === 'playing' ? '' : announced }}
    </p>

    <!-- The Books for assistive tech: the canvas names none of them. -->
    <BooksAccessibleList
      v-if="props.accessibleList"
      :books="books"
      :label="words.list"
      @pick="pickFromList"
    />

    <Teleport to="body">
      <BooksDetails
        class="reel-card__details"
        :class="sheet ? 'reel-card__details--sheet' : 'reel-card__details--card'"
        :sheet="sheet"
        :max-height="sheetHeight"
        :return-focus="stage"
        teleported
      />
    </Teleport>
    <BooksLabelMorph :stage="root" />
  </section>
</template>

<style scoped>
.reel-card {
  position: relative;
  min-width: 0;
  color: var(--_regal-ink);
  font-family: var(--_regal-font-body);
  font-size: var(--_regal-size-body);
  line-height: 1.35;
}

.reel-card *,
.reel-card *::before,
.reel-card *::after {
  box-sizing: border-box;
}

/* The prototype's stage: 330 px tall, the Books on their arc, the card's full width. */
.reel-card__stage {
  position: relative;
  height: var(--regal-reel-height, 330px);
  overflow: hidden;
  outline: none;
}

.reel-card__stage:focus-visible {
  outline: 2px solid var(--_regal-accent);
  outline-offset: -3px;
}

.reel-card__view {
  position: absolute;
  inset: 0;
  touch-action: pan-y;
  /* Broken out it lives in <body>: the reel's type comes along. */
  color: var(--_regal-ink);
  font-family: var(--_regal-font-body);
}

/* Broken out: over the whole viewport, above the host's page and its bars (--regal-reel-z-index). */
.reel-card__view--out {
  position: fixed;
  z-index: var(--regal-reel-z-index, 40);
}

.reel-card__view:not(.reel-card__view--ready) {
  /* Until the canvas has taken over there is nothing to press: the poster stands in (and the page scrolls). */
  pointer-events: none;
}

.reel-card__canvas {
  position: absolute !important;
  inset: 0;
  opacity: 0;
}

/* The 3D comes in over the poster once its first frame with the faces is drawn (`standard`, 250 ms). */
.reel-card__view--ready .reel-card__canvas {
  opacity: 1;
  transition: opacity 250ms cubic-bezier(0.2, 0, 0, 1);
}

.reel-card__view--still .reel-card__canvas {
  transition: none;
}

/* Under the front Book, over the stage's lower edge (the prototype's pills sit 46 px up into it). */
.reel-card__focus {
  position: relative;
  z-index: 1;
  margin-top: calc(-1 * var(--regal-reel-overlap, 46px));
  min-height: var(--regal-reel-overlap, 46px);
  opacity: var(--regal-reel-badge, 1);
  text-align: center;
  pointer-events: none;
}

.reel-card__focus--held {
  visibility: hidden;
}

/* The dots in the middle, the pause button at the right end. */
.reel-card__controls {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  margin-top: 2px;
}

.reel-card__count {
  margin: 0;
  color: var(--_regal-ink-faint);
  font-size: var(--_regal-size-small);
  font-variant-numeric: tabular-nums;
}

.reel-card__dots {
  display: flex;
  gap: 5px;
}

.reel-card__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--_regal-hairline);
  transition: width 250ms cubic-bezier(0.2, 0, 0, 1), background-color 250ms;
}

.reel-card__dot--on {
  width: 14px;
  border-radius: 3px;
  background: var(--_regal-ink);
}

.reel-card__pause {
  position: absolute;
  right: 0.75rem;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: var(--_regal-border-width) solid var(--_regal-hairline);
  border-radius: 50%;
  background: var(--_regal-surface);
  color: var(--_regal-ink);
  cursor: pointer;
}

.reel-card__pause::before {
  /* A 44 px touch target around the 28 px button (WCAG 2.5.5). */
  content: '';
  position: absolute;
  inset: -8px;
}

.reel-card__pause:hover {
  color: var(--_regal-accent);
}

.reel-card__pause:focus-visible {
  outline: 2px solid var(--_regal-accent);
  outline-offset: 2px;
}

.reel-card__pause svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}

.reel-card__pause .reel-card__play {
  fill: currentColor;
  stroke-linejoin: round;
}

/* Broken out the details live in <body> over the canvas: the Stack's sheet (a phone) or its card (wider). */
.reel-card__details--sheet {
  position: fixed;
  right: -1px;
  bottom: -1px;
  left: -1px;
  z-index: calc(var(--regal-reel-z-index, 40) + 1);
  width: auto;
}

.reel-card__details--card {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: calc(var(--regal-reel-z-index, 40) + 1);
  width: min(22rem, calc(100vw - 2rem));
}
</style>

<style src="../../assets/css/regal-theme.css"></style>

<style scoped src="../../assets/css/regal-visually-hidden.css"></style>
