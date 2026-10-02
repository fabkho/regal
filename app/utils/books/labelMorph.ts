// The label ↔ details card morph: when a Book is taken out, the label on screen
// (hover or scroll focus label) grows into the details card; putting it back
// shrinks the card into a label again. One box (the label's/card's hairline
// border on paper) travels between the two rects while the label text fades
// out early and the card's content fades in as the box arrives (or the other
// way round). Text is never scaled: contents are faded, only the box moves.
//
// Pure decisions and geometry, so they're unit-testable; the DOM side lives in
// composables/useLabelMorph.ts.

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/** How long the box travels (ms). About the slide-out phase of the 3D take-out, same ease. */
export const MORPH_MS = 440
/** Gap (px) kept between a label the box returns to and the stage's edge. */
export const STAGE_MARGIN = 8

/** What a change of the picked Book means for the card. */
export type PickChange = 'open' | 'close' | 'swap' | 'none'

export function pickChange(previous: string | null, next: string | null): PickChange {
  if (previous === next) return 'none'
  if (!previous) return 'open'
  if (!next) return 'close'
  return 'swap'
}

/** power2.inOut, the ease of the 3D take-out and return (components/books/Meshes.vue). */
export function easeInOut(t: number): number {
  const x = clamp01(t)
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** 0 before `from`, 1 after `to`, smooth in between. */
export function smoothstep(from: number, to: number, value: number): number {
  const x = clamp01((value - from) / (to - from))
  return x * x * (3 - 2 * x)
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

export function lerpRect(from: Rect, to: Rect, t: number): Rect {
  return {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    width: lerp(from.width, to.width, t),
    height: lerp(from.height, to.height, t),
  }
}

export function nearRect(a: Rect, b: Rect, epsilon = 0.5): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon
    && Math.abs(a.width - b.width) <= epsilon && Math.abs(a.height - b.height) <= epsilon
}

/** A rect relative to the stage's top-left corner (survives page scroll between open and close). */
export function toStage(rect: Rect, stage: Rect): Rect {
  return { ...rect, x: rect.x - stage.x, y: rect.y - stage.y }
}

export function fromStage(rect: Rect, stage: Rect): Rect {
  return { ...rect, x: rect.x + stage.x, y: rect.y + stage.y }
}

/** Moves (and if needed shrinks) `rect` so it lies inside `bounds`, `margin` px from its edges. */
export function clampInto(rect: Rect, bounds: Rect, margin = STAGE_MARGIN): Rect {
  const width = Math.min(rect.width, Math.max(0, bounds.width - 2 * margin))
  const height = Math.min(rect.height, Math.max(0, bounds.height - 2 * margin))
  const minX = bounds.x + margin
  const minY = bounds.y + margin
  const maxX = bounds.x + bounds.width - margin - width
  const maxY = bounds.y + bounds.height - margin - height
  return {
    x: Math.min(Math.max(rect.x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(rect.y, minY), Math.max(minY, maxY)),
    width,
    height,
  }
}

/**
 * Eases `current` towards `desired` (a target that moves while the box
 * travels: the card growing when its blurb arrives, the pointer under a hover
 * label). `ms` is the frame time; ~60 ms time constant, so a jump in the target
 * is caught up within a few frames instead of showing as a jump of the box.
 */
export function followRect(current: Rect, desired: Rect, ms: number, timeConstant = 60): Rect {
  const t = 1 - Math.exp(-Math.max(0, ms) / timeConstant)
  return lerpRect(current, desired, t)
}

export type LabelKind = 'hover' | 'focus'

/** A label on screen right now, showing `bookId`. */
export interface ShownLabel {
  kind: LabelKind
  bookId: string
  rect: Rect
}

/** The label showing `bookId`: the hover label first, else the scroll focus label. */
export function labelFor(bookId: string, labels: readonly (ShownLabel | null | undefined)[]): ShownLabel | null {
  const showing = labels.filter((label): label is ShownLabel => !!label && label.bookId === bookId)
  return showing.find(label => label.kind === 'hover') ?? showing[0] ?? null
}

/** What the travelling box looks like at one moment: where, and how much of each content shows. */
export interface MorphFrame {
  rect: Rect
  /** Opacity of the label text (title and stars). */
  label: number
  /** Opacity of the card's content. */
  card: number
}

export type MorphDirection = 'open' | 'close'

/** One leg of the morph, from wherever the box was when it started (a label, the card, or mid-way). */
export interface MorphLeg {
  direction: MorphDirection
  from: MorphFrame
}

/** Label text fades out over the first third of an open; card content fades in over the last half. */
const FADE_OUT_END = 0.35
const FADE_IN_START = 0.5

/** The box at time `t` (0..1) of a leg heading for `target`. */
export function sampleLeg(leg: MorphLeg, t: number, target: Rect): MorphFrame {
  const rect = lerpRect(leg.from.rect, target, easeInOut(t))
  const out = 1 - smoothstep(0, FADE_OUT_END, t)
  const into = smoothstep(FADE_IN_START, 1, t)
  if (leg.direction === 'open') {
    return { rect, label: leg.from.label * out, card: lerp(leg.from.card, 1, into) }
  }
  return { rect, card: leg.from.card * out, label: lerp(leg.from.label, 1, into) }
}

/** How the card comes in or goes away: the morph, or the plain fade (no label to morph from/to). */
export type MorphPlan = { kind: 'morph', from: MorphFrame, source: ShownLabel | null } | { kind: 'fade' }

/**
 * Taking `bookId` out. Morphs from the label showing it (hover label, else
 * focus label), or from wherever the box is when a morph is under way (a
 * close interrupted by another pick). No label (a pick from the Book list or
 * the keyboard, a touch without a label) or reduced motion: the plain fade.
 */
export function planOpen(input: {
  bookId: string
  labels: readonly (ShownLabel | null | undefined)[]
  running: MorphFrame | null
  reduced: boolean
}): MorphPlan {
  if (input.reduced) return { kind: 'fade' }
  if (input.running) return { kind: 'morph', from: input.running, source: null }
  const source = labelFor(input.bookId, input.labels)
  if (!source) return { kind: 'fade' }
  return { kind: 'morph', from: { rect: source.rect, label: 1, card: 0 }, source }
}

/**
 * Putting the Book back. Morphs back to a label only when the card came from
 * one (`hasSource`, stored at open); starts from wherever the box is when an
 * open is still under way, else from the card.
 */
export function planClose(input: {
  card: Rect | null
  running: MorphFrame | null
  hasSource: boolean
  reduced: boolean
}): MorphPlan {
  if (input.reduced || !input.hasSource) return { kind: 'fade' }
  if (input.running) return { kind: 'morph', from: input.running, source: null }
  if (!input.card || !input.card.width) return { kind: 'fade' }
  return { kind: 'morph', from: { rect: input.card, label: 0, card: 1 }, source: null }
}

/** Where a closing box lands, and what happens once it's there. */
export interface CloseTarget {
  rect: Rect
  /** A real label shows this Book there and takes over; else the box fades out. */
  landing: 'label' | 'fade'
}

/**
 * The close morph's target: the label showing the Book if one would show
 * (the hover label at the pointer, else the focus label), else the place of
 * the label it opened from (`stored`, relative to the stage), sized for this
 * Book's label (`size`) and clamped into the stage.
 */
export function closeTarget(input: {
  bookId: string
  labels: readonly (ShownLabel | null | undefined)[]
  stored: Rect
  stage: Rect
  size?: Size | null
}): CloseTarget {
  const live = labelFor(input.bookId, input.labels)
  if (live) return { rect: live.rect, landing: 'label' }
  const place = fromStage(input.stored, input.stage)
  const sized = input.size?.width ? { ...place, width: input.size.width, height: input.size.height } : place
  return { rect: clampInto(sized, input.stage), landing: 'fade' }
}
