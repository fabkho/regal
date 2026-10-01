// Which Book is under a point of the canvas, raycast against where the Books
// are drawn right now. Picking asks this at the moment of the click instead of
// trusting a hover intersection from the last pointer move: Books and the
// camera move under a still pointer (scrolling, a re-sort, the Pick itself).
import { Raycaster, Vector2 } from 'three'
import type { Camera, Object3D } from 'three'

const raycaster = new Raycaster()
const ndc = new Vector2()

/** Client coordinates to normalized device coordinates of `element`, or null outside it. */
export function toNdc(element: Element, clientX: number, clientY: number): Vector2 | null {
  const rect = element.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const x = (clientX - rect.left) / rect.width
  const y = (clientY - rect.top) / rect.height
  if (x < 0 || x > 1 || y < 0 || y > 1) return null
  return ndc.set(x * 2 - 1, 1 - y * 2)
}

/**
 * The Book nearest the camera at `point` (normalized device coordinates):
 * the first mesh under `root` carrying a `userData.bookId`. Anything else
 * (furniture, the floor) doesn't hide a Book, as with the hover events.
 */
export function bookAt(root: Object3D | null | undefined, camera: Camera | null | undefined, point: Vector2): string | null {
  if (!root || !camera) return null
  raycaster.setFromCamera(point, camera)
  for (const hit of raycaster.intersectObject(root, true)) {
    const bookId = hit.object.userData?.bookId
    if (typeof bookId === 'string' && hit.object.visible) return bookId
  }
  return null
}
