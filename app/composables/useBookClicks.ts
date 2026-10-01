import type { ShallowRef } from 'vue'
import type { Object3D } from 'three'
import { useTres } from '@tresjs/core'
import { bookAt, toNdc } from '~/utils/books/hit'
import { isClick, movePress, startPress } from '~/utils/books/press'
import type { Press } from '~/utils/books/press'

/**
 * Clicks in the 3D view: a click on a Book picks, flips or puts it away, a
 * click on empty space puts the picked Book back.
 *
 * Deliberately not the scene's own click events: those hit whatever was under
 * the pointer at its last move (stale once the Stack scrolls, a re-sort runs
 * or the picked Book flies off), drop presses held over 300 ms and need the
 * press and the release on the same object. Here what a click hits is raycast
 * when the button goes down, against the Books as they are drawn at that
 * moment (what the user aimed at, before a wobble scrolls the Stack or spins
 * the Book), and it counts when the press stayed put (utils/books/press.ts).
 * Call inside the TresCanvas.
 */
export function useBookClicks(books: Readonly<ShallowRef<Object3D | null>>) {
  const { camera, renderer } = useTres()
  const { clickAt } = useBookPick()
  const look = useLook()
  let press: Press | null = null
  /** The Book under the press, or null for empty space. */
  let aimed: string | null = null

  const canvas = () => renderer.domElement as HTMLCanvasElement | undefined

  function onDown(event: PointerEvent) {
    const element = canvas()
    const point = element && event.button === 0 && event.isPrimary ? toNdc(element, event.clientX, event.clientY) : null
    press = point ? startPress(event) : null
    aimed = point ? bookAt(books.value, camera.value, point) : null
  }

  function onMove(event: PointerEvent) {
    if (press) press = movePress(press, event)
  }

  function onUp(event: PointerEvent) {
    const ended = press
    press = null
    const element = canvas()
    // Released over the canvas itself (not a card or a control on top of it).
    if (!element || event.target !== element || !isClick(ended, event)) return
    clickAt(aimed, look.value.pickOutside)
  }

  function onCancel() {
    press = null
  }

  onMounted(() => {
    canvas()?.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onCancel)
  })

  onBeforeUnmount(() => {
    canvas()?.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('blur', onCancel)
  })
}
