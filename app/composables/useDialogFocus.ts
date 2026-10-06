import { FOCUSABLE, trapIndex } from '#layers/regal/app/utils/a11y/focus'

interface DialogFocusOptions {
  /** The dialog is open (a Book is out). */
  open: () => boolean
  /** The dialog's element (`role="dialog"`, `tabindex="-1"`): focus goes to it on open. */
  dialog: Readonly<Ref<HTMLElement | null>>
  /** Other elements that belong to the dialog while it is open (the row's Back button). */
  also?: () => (HTMLElement | null | undefined)[]
  /** Modal: Tab stays in the dialog (and `also`) while it is open. */
  modal: () => boolean
  /** Where focus goes on close when what opened the dialog is gone. */
  fallback?: () => HTMLElement | null | undefined
}

/** Reachable by keyboard right now (not display: none, not visibility: hidden). */
function reachable(element: HTMLElement): boolean {
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
}

/**
 * The details of a Book taken out as a real dialog's keyboard side: focus moves
 * into it on open (to the dialog itself, so a screen reader reads its name, then
 * Tab walks its controls), stays in it while it is modal, and on close goes back
 * to what had focus when it opened (a button of the Book list, the row's scroller)
 * or to `fallback`. A mouse user who never had focus anywhere keeps it nowhere.
 *
 * Escape closes through the 3D's own key handling (it listens on the window), so
 * it works wherever focus is.
 */
export function useDialogFocus(options: DialogFocusOptions) {
  let opener: HTMLElement | null = null
  let frame = 0
  /** The dialog's element as long as it is open: a leaving one has lost its ref but is still on the page (and may hold focus). */
  let element: HTMLElement | null = null
  watch(options.dialog, (current) => {
    if (current) element = current
  }, { flush: 'post' })

  const roots = () => [options.dialog.value ?? element, ...(options.also?.() ?? [])].filter((candidate): candidate is HTMLElement => !!candidate)
  const inside = (element: Element | null) => !!element && roots().some(root => root.contains(element))
  const active = () => (document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const resting = (element: HTMLElement | null) => !element || element === document.body || element === document.documentElement

  /** Focusable things in the dialog, in page order. */
  function stops(): HTMLElement[] {
    const found = new Set<HTMLElement>()
    for (const root of roots()) {
      if (root.matches(FOCUSABLE)) found.add(root)
      for (const element of root.querySelectorAll<HTMLElement>(FOCUSABLE)) found.add(element)
    }
    return [...found].filter(reachable).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
  }

  /** Focus the dialog; a card still morphing in is hidden (can't take focus yet), so ask again for a moment. */
  function focusIn(tries = 90) {
    cancelAnimationFrame(frame)
    const dialog = options.dialog.value
    if (!dialog || !options.open()) return
    dialog.focus({ preventScroll: true })
    if (document.activeElement !== dialog && tries > 0) frame = requestAnimationFrame(() => focusIn(tries - 1))
  }

  watch(options.open, (open, wasOpen) => {
    if (open && !wasOpen) {
      const current = active()
      opener = resting(current) || inside(current) ? null : current
      focusIn()
    }
    else if (!open && wasOpen) {
      cancelAnimationFrame(frame)
      const current = active()
      const target = opener?.isConnected ? opener : options.fallback?.() ?? null
      // Only take focus back when it would otherwise be lost: still in the dialog, or nowhere.
      if (target && (inside(current) || (resting(current) && opener))) target.focus({ preventScroll: true })
      opener = null
      element = null
    }
  }, { flush: 'post' })

  function onTab(event: KeyboardEvent) {
    if (event.key !== 'Tab' || event.defaultPrevented || !options.open() || !options.modal()) return
    const items = stops()
    const current = active()
    const index = current ? items.indexOf(current) : -1
    const within = inside(current)
    // In the middle of the dialog Tab does its own thing; at its ends (or outside it) it wraps.
    if (within && index >= 0 && index !== (event.shiftKey ? 0 : items.length - 1)) return
    event.preventDefault()
    const target = items[trapIndex(items.length, within ? index : -1, event.shiftKey)] ?? options.dialog.value
    target?.focus()
  }

  onMounted(() => document.addEventListener('keydown', onTab))
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onTab)
    cancelAnimationFrame(frame)
  })
}
