import type { Ref } from 'vue'
import type { SheetSettle } from '#layers/regal/app/utils/books/sheet'
import { dragOffset, settleDrag, TAP_SLOP } from '#layers/regal/app/utils/books/sheet'

/** The sheet springing back after a drag that didn't close it. */
const BACK_MS = 220
/** A finger resting this long (ms) before it lifts is no flick. */
const REST_MS = 80

/**
 * Dragging a bottom sheet down by its grip (utils/books/sheet.ts decides what
 * a release does): the sheet follows the finger down and gives a little up.
 * Bind `handlers` on the grip (touch-action: none). A put-back leaves the
 * sheet where the finger let go: the label morph starts from there.
 */
export function useSheetDrag(options: {
  sheet: Ref<HTMLElement | null>
  enabled: () => boolean
  onSettle: (settle: SheetSettle) => void
}) {
  const dragging = ref(false)
  const reducedMotion = usePreferredReducedMotion()
  let pointer: number | null = null
  let startY = 0
  let lastY = 0
  let lastTime = 0
  let velocity = 0
  let offset = 0
  let back: Animation | null = null

  function place(next: number) {
    offset = next
    const element = options.sheet.value
    if (element) element.style.transform = next ? `translateY(${next}px)` : ''
  }

  function springBack() {
    const from = offset
    place(0)
    const element = options.sheet.value
    if (!from || !element || reducedMotion.value === 'reduce') return
    back = element.animate([{ transform: `translateY(${from}px)` }, { transform: 'none' }], { duration: BACK_MS, easing: 'cubic-bezier(0, 0, 0.2, 1)' })
  }

  function onPointerdown(event: PointerEvent) {
    if (pointer !== null || !options.enabled() || (event.pointerType === 'mouse' && event.button !== 0)) return
    pointer = event.pointerId
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    back?.cancel()
    back = null
    startY = lastY = event.clientY
    lastTime = event.timeStamp
    velocity = 0
  }

  function onPointermove(event: PointerEvent) {
    if (event.pointerId !== pointer) return
    const elapsed = event.timeStamp - lastTime
    // Smoothed: one late touch event shouldn't make or break a flick.
    if (elapsed > 0) velocity = 0.6 * (event.clientY - lastY) / elapsed + 0.4 * velocity
    lastY = event.clientY
    lastTime = event.timeStamp
    const dy = event.clientY - startY
    if (!dragging.value && Math.abs(dy) < TAP_SLOP) return
    dragging.value = true
    place(dragOffset(dy))
  }

  function onPointerup(event: PointerEvent) {
    if (event.pointerId !== pointer) return
    pointer = null
    if (event.timeStamp - lastTime > REST_MS) velocity = 0
    const settle = event.type === 'pointercancel'
      ? 'stay'
      : settleDrag({
          dy: event.clientY - startY,
          velocity,
          height: options.sheet.value?.offsetHeight ?? 0,
        })
    dragging.value = false
    if (settle !== 'dismiss') springBack()
    options.onSettle(settle)
  }

  return {
    dragging,
    // Event names, for v-on="handlers".
    handlers: { pointerdown: onPointerdown, pointermove: onPointermove, pointerup: onPointerup, pointercancel: onPointerup },
  }
}
