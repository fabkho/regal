import type { Ref } from 'vue'
import type { LabelKind, MorphFrame, MorphLeg, Rect, ShownLabel } from '#layers/regal/app/utils/books/labelMorph'
import {
  closeTarget, clamp01, followRect, labelFor, MORPH_MS, nearRect, pickChange, planClose, planOpen, sampleLeg, toStage,
} from '#layers/regal/app/utils/books/labelMorph'

// The label ↔ details card morph (decisions and geometry in
// utils/books/labelMorph.ts). A ghost box (components/books/LabelMorph.vue,
// teleported, position fixed) travels between the label and the card; the
// real card is laid out at its place from the start, hidden until the box
// arrives, so the target is measured live every frame (it grows when the blurb
// arrives, moves with the page). Driven per frame rather than by one Web
// Animation for that reason, and so a click mid-way retargets from wherever
// the box is.

export interface LabelMorphFlags {
  /** A morph is under way (the ghost box shows). */
  active: boolean
  /** The card is laid out but hidden: the box is still on its way to it. */
  cardHidden: boolean
  /** The card comes and goes with its own fade (no morph). */
  cardFade: boolean
  /** The labels hold back: the box is or will become the label. */
  labelsHidden: boolean
  /** The Book whose title the box shows while it is (or becomes) a label. */
  labelBookId: string | null
}

/** Reactive state of the morph, for the labels, the card and the ghost box. */
export function useLabelMorph() {
  return useState<LabelMorphFlags>('books:label-morph', () => ({
    active: false,
    cardHidden: false,
    cardFade: true,
    labelsHidden: false,
    labelBookId: null,
  }))
}

interface LabelSource {
  kind: LabelKind
  read: () => { bookId: string, el: HTMLElement } | null
}

// Elements on the page, registered on mount (client only).
const labelSources = new Set<LabelSource>()
const cardSources = new Set<() => HTMLElement | null>()

/** A label (hover or focus) registers what it shows, so the morph can start or land on it. */
export function useLabelMorphLabel(kind: LabelKind, read: LabelSource['read']) {
  const source = { kind, read }
  onMounted(() => labelSources.add(source))
  onBeforeUnmount(() => labelSources.delete(source))
}

/** The details card registers its root element. */
export function useLabelMorphCard(read: () => HTMLElement | null) {
  onMounted(() => cardSources.add(read))
  onBeforeUnmount(() => cardSources.delete(read))
}

function rectOf(element: Element): Rect {
  const { left, top, width, height } = element.getBoundingClientRect()
  return { x: left, y: top, width, height }
}

type SeenLabel = ShownLabel & { el: HTMLElement }

/** The labels rendered right now (hidden ones too: where they would show). */
function shownLabels(): SeenLabel[] {
  const shown: SeenLabel[] = []
  for (const source of labelSources) {
    const label = source.read()
    if (label) shown.push({ kind: source.kind, bookId: label.bookId, el: label.el, rect: rectOf(label.el) })
  }
  return shown
}

function cardElement(): HTMLElement | null {
  for (const read of cardSources) {
    const element = read()
    if (element?.isConnected) return element
  }
  return null
}

const TEXT_PROPERTIES = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'color', 'text-transform']

/** The box lives in <body>: give it the type its original inherits where it sits. */
function copyText(from: Element, to: HTMLElement) {
  const style = getComputedStyle(from)
  for (const property of TEXT_PROPERTIES) to.style.setProperty(property, style.getPropertyValue(property))
}

/** A still copy of the card for the box to fade: same content, no frame, no position of its own. */
function cloneCard(card: HTMLElement): HTMLElement {
  const clone = card.cloneNode(true) as HTMLElement
  copyText(card, clone)
  for (const element of [clone, ...clone.querySelectorAll<HTMLElement>('*')]) {
    element.removeAttribute('id')
    for (const name of [...element.classList]) {
      if (/-(?:enter|leave)-(?:from|active|to)$/.test(name)) element.classList.remove(name)
    }
  }
  clone.removeAttribute('aria-live')
  Object.assign(clone.style, {
    position: 'static',
    inset: 'auto',
    margin: '0',
    width: `${card.offsetWidth}px`,
    height: 'auto',
    transform: 'none',
    visibility: 'visible',
    opacity: '1',
    borderColor: 'transparent',
    background: 'transparent',
    transition: 'none',
    animation: 'none',
  })
  return clone
}

/**
 * Runs the morph. Call once, in the ghost box component: `box` is the
 * travelling frame, `labelLayer` the label text inside it (rendered for
 * `labelBookId`), `cardLayer` takes the copy of the card.
 */
export function useLabelMorphController(elements: {
  stage: () => HTMLElement | null
  box: Ref<HTMLElement | null>
  labelLayer: Ref<HTMLElement | null>
  cardLayer: Ref<HTMLElement | null>
}) {
  const flags = useLabelMorph()
  const reducedMotion = usePreferredReducedMotion()

  let leg: MorphLeg | null = null
  /** When the leg's first frame ran (0: not yet). */
  let legStart = 0
  let lastFrame = 0
  /** Where the box heads, eased towards the live target. */
  let target: Rect | null = null
  /** The box as last drawn. */
  let shown: MorphFrame | null = null
  /** The Book being put back (close legs). */
  let closing: string | null = null
  /** The label the card opened from, relative to the stage: where it goes back to. */
  let stored: Rect | null = null
  let raf = 0
  let fadeOut: Animation | null = null
  /** Watches the card on the way in: its blurb (or a swapped Book) can arrive while the box travels. */
  let cardObserver: MutationObserver | null = null
  let cardChanged = false

  const stageRect = () => {
    const stage = elements.stage()
    return stage ? rectOf(stage) : null
  }

  function draw(frame: MorphFrame) {
    const box = elements.box.value
    if (!box) return
    shown = frame
    box.style.transform = `translate(${frame.rect.x}px, ${frame.rect.y}px)`
    box.style.width = `${frame.rect.width}px`
    box.style.height = `${frame.rect.height}px`
    if (elements.labelLayer.value) elements.labelLayer.value.style.opacity = String(frame.label)
    if (elements.cardLayer.value) elements.cardLayer.value.style.opacity = String(frame.card)
  }

  function setCardLayer(card: HTMLElement | null) {
    const layer = elements.cardLayer.value
    if (layer) layer.replaceChildren(...(card ? [cloneCard(card)] : []))
  }

  /** Copies the card into the box, and again whenever its content changes until the box arrives. */
  function followCard(card: HTMLElement | null) {
    cardObserver?.disconnect()
    cardObserver = null
    cardChanged = false
    setCardLayer(card)
    if (!card) return
    cardObserver = new MutationObserver(() => {
      cardChanged = true
    })
    cardObserver.observe(card, { childList: true, subtree: true, characterData: true })
  }

  /** Sizes the label text like `label` (a real one), or to its own width when null. */
  function fitLabelLayer(label: HTMLElement | null, width?: number) {
    const layer = elements.labelLayer.value
    if (!layer) return
    if (label) copyText(label, layer)
    layer.style.width = width ? `${width}px` : ''
  }

  function hideBox() {
    cardObserver?.disconnect()
    cardObserver = null
    fadeOut?.cancel()
    fadeOut = null
    const box = elements.box.value
    if (box) box.style.display = 'none'
    setCardLayer(null)
    shown = null
  }

  function settle() {
    flags.value.active = false
    flags.value.cardHidden = false
    flags.value.labelsHidden = false
  }

  /** Ends whatever runs, at once. */
  function stop() {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    leg = null
    hideBox()
    settle()
  }

  function startLeg(next: MorphLeg) {
    fadeOut?.cancel()
    fadeOut = null
    leg = next
    legStart = 0
    lastFrame = 0
    target = null
    const box = elements.box.value
    if (box) box.style.display = 'block'
    draw(next.from)
    flags.value.active = true
    if (!raf) raf = requestAnimationFrame(tick)
  }

  function open(bookId: string) {
    const labels = shownLabels()
    const plan = planOpen({ bookId, labels, running: leg ? shown : null, reduced: reducedMotion.value === 'reduce' })
    if (plan.kind === 'fade') {
      stop()
      stored = null
      flags.value.cardFade = true
      return
    }
    const stage = stageRect()
    if (plan.source && stage) {
      stored = toStage(plan.source.rect, stage)
      // labelFor() hands back one of the labels it was given.
      fitLabelLayer((plan.source as SeenLabel).el, plan.source.rect.width)
      flags.value.labelBookId = bookId
      setCardLayer(null)
    }
    flags.value.cardFade = false
    flags.value.cardHidden = true
    flags.value.labelsHidden = true
    startLeg({ direction: 'open', from: plan.from })
    // The card renders on this tick (hidden): copy it for the box to fade in.
    nextTick(() => {
      if (leg?.direction === 'open') followCard(cardElement())
    })
  }

  function close(bookId: string) {
    const card = cardElement()
    const running = leg ? shown : null
    const plan = planClose({ card: card ? rectOf(card) : null, running, hasSource: !!stored, reduced: reducedMotion.value === 'reduce' })
    if (plan.kind === 'fade') {
      stop()
      stored = null
      flags.value.cardFade = true
      return
    }
    // Copy the card while it still shows the Book; it goes at once, the box takes its place.
    cardObserver?.disconnect()
    cardObserver = null
    if (!running) setCardLayer(card)
    closing = bookId
    flags.value.labelBookId = bookId
    flags.value.cardFade = false
    flags.value.cardHidden = false
    flags.value.labelsHidden = true
    startLeg({ direction: 'close', from: plan.from })
  }

  /** Where the box heads now; null when that is gone (abort). */
  function aim(): { rect: Rect, landing: 'card' | 'label' | 'fade' } | null {
    if (leg?.direction === 'open') {
      const card = cardElement()
      if (card && cardChanged) {
        cardChanged = false
        setCardLayer(card)
      }
      return card ? { rect: rectOf(card), landing: 'card' } : null
    }
    const stage = stageRect()
    if (!closing || !stored || !stage) return null
    const labels = shownLabels()
    const live = labelFor(closing, labels) as SeenLabel | null
    fitLabelLayer(live?.el ?? null, live?.rect.width)
    const layer = elements.labelLayer.value
    const size = layer && !live ? { width: layer.offsetWidth, height: layer.offsetHeight } : null
    return closeTarget({ bookId: closing, labels, stored, stage, size })
  }

  function tick(now: number) {
    raf = 0
    if (!leg) return
    const ms = lastFrame ? now - lastFrame : 16
    lastFrame = now
    if (!legStart) legStart = now
    const t = clamp01((now - legStart) / MORPH_MS)
    const heading = aim()
    if (!heading) {
      stop()
      return
    }
    target = target ? followRect(target, heading.rect, ms) : heading.rect
    if (t >= 1 && nearRect(target, heading.rect)) {
      draw(sampleLeg(leg, 1, heading.rect))
      land(heading.landing)
      return
    }
    draw(sampleLeg(leg, t, target))
    raf = requestAnimationFrame(tick)
  }

  function land(landing: 'card' | 'label' | 'fade') {
    leg = null
    if (landing !== 'card') {
      closing = null
      stored = null
    }
    if (landing === 'fade') {
      // No label shows this Book here: the label the box became fades away.
      const box = elements.box.value
      settle()
      fadeOut = box?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out' }) ?? null
      if (fadeOut) fadeOut.onfinish = () => hideBox()
      else hideBox()
      return
    }
    // The real card or label is exactly where the box is: swap them in one frame.
    hideBox()
    settle()
  }

  let unregister: (() => void) | null = null
  onMounted(() => {
    unregister = onBeforePickChange((previous, next) => {
      const change = pickChange(previous, next)
      if (change === 'open' && next) open(next)
      else if (change === 'close' && previous) close(previous)
      // A swap keeps the card (it cross-fades itself); mid-open, followCard() copies the new content.
    })
  })
  onBeforeUnmount(() => {
    unregister?.()
    stop()
  })
}
