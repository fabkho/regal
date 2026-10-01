import type { PerspectiveCamera } from 'three'
import { Vector3 } from 'three'
import { useTres } from '@tresjs/core'
import type { BookPose } from '#layers/regal/app/utils/books/pose'
import { approach, easeRate, liftFor, nearestBook, STACK_SCROLL, targetAmount, waveLevel } from '#layers/regal/app/utils/stack/scrollHighlight'
import type { Lift } from '#layers/regal/app/utils/stack/scrollHighlight'

/** Mouse travel (px) after a scroll before hover takes over again; ignores a hand resting on the mouse. */
const MOUSE_TAKEOVER = 8
let mouseTravel = 0

/**
 * Who leads the highlight: scrolling (the scroll focus) or the mouse (hover).
 * Scrolling, dragging and touch hand it to the scroll focus; moving the mouse
 * a little gives it back to hover.
 */
export function useScrollLead() {
  const scrollLed = useState('books:scroll-led', () => false)
  return {
    scrollLed: readonly(scrollLed),
    /** The view was scrolled (wheel, drag, keys) or touched. */
    scrolled() {
      mouseTravel = 0
      if (!scrollLed.value) scrollLed.value = true
    },
    /** A mouse move: enough of them hand the highlight back to hover. */
    moved(event: PointerEvent) {
      if (!scrollLed.value || event.pointerType !== 'mouse' || event.buttons) return
      mouseTravel += Math.abs(event.movementX) + Math.abs(event.movementY)
      if (mouseTravel > MOUSE_TAKEOVER) scrollLed.value = false
    },
  }
}

/** The Book the scroll focus is on (null when there is none), shared with the focus label. */
export function useFocusedBook() {
  return useState<string | null>('books:focused', () => null)
}

/** Where the focus label goes, in canvas pixels: right of the focused Book's end, on the focus line. */
export function useFocusAnchor() {
  return useState('books:focus-anchor', () => ({ x: 0, y: 0, width: 0 }))
}

const ZERO: Readonly<Lift> = Object.freeze({ out: 0, slide: 0, tilt: 0, yaw: 0, shine: 0 })
const anchorPoint = new Vector3()

/**
 * Scroll highlight for the Book meshes (see utils/stack/scrollHighlight.ts).
 * Only the Stack scene provides a scroll; elsewhere (the Bookcase) every lift
 * is zero. Call inside the TresCanvas; `update` once per frame before the
 * Books, then `liftOf` per Book. Allocates nothing per frame.
 */
export function useScrollHighlight() {
  const scroll = inject(STACK_SCROLL, null)
  const look = useLook()
  const { camera, sizes } = useTres()
  const { scrollLed, moved } = useScrollLead()
  const focusedBook = useFocusedBook()
  const anchor = useFocusAnchor()
  const reducedMotion = usePreferredReducedMotion()

  /** Eased amount (0..1) per Book. */
  const amounts = new Map<string, number>()
  const lift: Lift = { out: 0, slide: 0, tilt: 0, yaw: 0, shine: 0 }
  const reach: Lift = { out: 0, slide: 0, tilt: 0, yaw: 0, shine: 0 }
  let on = false
  let focusId: string | null = null
  let level = 0
  let delta = 0.016
  let reduced = false

  /**
   * Starts a frame. `blocked`: a Book is out or a re-sort runs; `hoverId`: the
   * Book under the mouse, which wins over the focus unless the user scrolled since.
   */
  function update(poses: readonly BookPose[], frameDelta: number, blocked: boolean, hoverId: string | null) {
    delta = frameDelta
    reduced = reducedMotion.value === 'reduce'
    on = !!scroll && !blocked && !(hoverId && !scrollLed.value)
    level = scroll ? waveLevel(scroll.speed) : 0
    const index = on ? nearestBook(poses, scroll!.focusY, focusId) : -1
    focusId = index >= 0 ? poses[index]!.bookId : null
    if (focusedBook.value !== focusId) focusedBook.value = focusId
    if (index >= 0) placeAnchor(poses[index]!)
  }

  /** The lift of one Book this frame; `frozen` (picked or on its way back) gets none. */
  function liftOf(pose: BookPose, frozen: boolean): Readonly<Lift> {
    if (!scroll) return ZERO
    const variant = look.value.scrollHighlight
    const target = on && !frozen
      ? targetAmount(variant, pose.y - scroll.focusY, pose.bookId === focusId, level, scroll.speed)
      : 0
    const current = amounts.get(pose.bookId) ?? 0
    if (current === 0 && target === 0) return ZERO
    const amount = approach(current, target, easeRate(variant, target > current), delta)
    amounts.set(pose.bookId, amount)
    return liftFor(variant, amount, reduced, lift)
  }

  function placeAnchor(pose: BookPose) {
    const cam = camera.value as PerspectiveCamera | undefined
    if (!cam || !scroll) return
    cam.updateMatrixWorld()
    // Clear of the Book at its furthest out (the wave draws Books sideways).
    const clearance = liftFor(look.value.scrollHighlight, 1, reduced, reach).slide
    anchorPoint.set(pose.x + pose.height / 2 + clearance, scroll.focusY, pose.z + pose.depth / 2).project(cam)
    // The canvas size in CSS pixels, kept by Tres (no layout read per frame).
    const width = sizes.width.value
    const x = (anchorPoint.x + 1) / 2 * width
    const y = (1 - anchorPoint.y) / 2 * sizes.height.value
    const value = anchor.value
    if (Math.abs(value.x - x) > 0.5 || Math.abs(value.y - y) > 0.5 || value.width !== width) {
      anchor.value = { x, y, width }
    }
  }

  onMounted(() => window.addEventListener('pointermove', moved))
  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', moved)
    if (scroll) focusedBook.value = null
  })

  return { focusedBook: readonly(focusedBook), scrollLed, update, liftOf }
}
