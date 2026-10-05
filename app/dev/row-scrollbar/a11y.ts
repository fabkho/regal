// Design round (RegalBooksRow scroll indicator), dev only: what every
// indicator variant says to assistive technology. The row's own scroller keeps
// its keyboard scrolling and its label ("77 books, scroll sideways"); the
// indicator is a `scrollbar` (controls the scroller, value = how far, value
// text = "Book 12 of 77, MAY 2025") that is not a tab stop (tabindex -1), so
// the keyboard has one stop, not two; focused by a tap it answers the arrows.
import type { RowIndicatorState } from './useRowIndicator'

export function useScrollbarA11y(state: RowIndicatorState, label = 'Position in the row') {
  const attrs = computed(() => ({
    'role': 'scrollbar',
    'aria-orientation': 'horizontal',
    'aria-label': label,
    'aria-controls': state.scroller?.id || undefined,
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-valuenow': Math.round(state.progress * 100),
    'aria-valuetext': state.valueText || undefined,
    'tabindex': -1,
  }))

  function onKeydown(event: KeyboardEvent) {
    const page = 0.7 * state.clientWidth
    const keys: Record<string, () => void> = {
      ArrowLeft: () => state.scrollToLeft(state.scrollLeft - page),
      ArrowRight: () => state.scrollToLeft(state.scrollLeft + page),
      Home: () => state.scrollToLeft(0),
      End: () => state.scrollToLeft(state.maxScroll),
    }
    const run = keys[event.key]
    if (!run) return
    event.preventDefault()
    run()
  }

  return { attrs, onKeydown }
}
