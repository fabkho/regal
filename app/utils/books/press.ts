// Tells a click on the 3D from a drag (spinning a picked Book, scrolling the
// Stack, orbiting the Bookcase). A press is a click when the pointer ends
// where it started, give or take a hand's wobble, however long it was held.
// Pure, so it's unit-testable; useBookClicks drives it.

/** Pixels a pressed pointer may wander and still click: hands and trackpads jitter. */
export const CLICK_SLOP = 6

export interface PointerPoint {
  pointerId: number
  clientX: number
  clientY: number
}

export interface Press {
  pointerId: number
  x: number
  y: number
  /** Furthest the pointer got from where it went down. */
  travel: number
}

export function startPress(event: PointerPoint): Press {
  return { pointerId: event.pointerId, x: event.clientX, y: event.clientY, travel: 0 }
}

function distance(press: Press, event: PointerPoint) {
  return Math.hypot(event.clientX - press.x, event.clientY - press.y)
}

export function movePress(press: Press, event: PointerPoint): Press {
  if (event.pointerId !== press.pointerId) return press
  return { ...press, travel: Math.max(press.travel, distance(press, event)) }
}

/** The press ended as a click: same pointer, never further than CLICK_SLOP from where it started. */
export function isClick(press: Press | null, release: PointerPoint): boolean {
  if (!press || release.pointerId !== press.pointerId) return false
  return Math.max(press.travel, distance(press, release)) <= CLICK_SLOP
}
