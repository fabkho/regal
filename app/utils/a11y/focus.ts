// Keyboard focus for Regal's dialogs (the details card or sheet, the row's
// broken-out card) and its Book list. Pure where it can be, so it's testable.

/** What takes Tab: links, buttons, fields, anything with a tabindex, not the disabled or the hidden. */
export const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

/**
 * Where Tab goes in a trap of `count` stops: from `index` (-1: focus is outside
 * the trap) forwards or, with Shift, backwards, wrapping at both ends.
 */
export function trapIndex(count: number, index: number, backwards: boolean): number {
  if (count <= 0) return -1
  if (index < 0) return backwards ? count - 1 : 0
  return (index + (backwards ? count - 1 : 1)) % count
}

/**
 * Where an arrow key moves in a list of `count` items from `index`: Up/Left
 * back, Down/Right forward, Home and End to the ends, no wrapping (the list
 * has two ends). `null` for any other key.
 */
export function listIndex(count: number, index: number, key: string): number | null {
  if (count <= 0) return null
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return Math.min(count - 1, index + 1)
    case 'ArrowUp':
    case 'ArrowLeft':
      return Math.max(0, index - 1)
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}
