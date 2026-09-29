// Distinguishes a drag (spinning a picked Book) from a click: pointer events
// that end a drag must not also count as a click on a Book or on empty space.

let lastDragEnd = 0

export function markDragEnd() {
  lastDragEnd = performance.now()
}

/** True right after a drag ended, when the browser still fires its click. */
export function justDragged(windowMs = 250): boolean {
  return performance.now() - lastDragEnd < windowMs
}
