// Faces rows drew, kept for the page (module level, not per row): a row
// mounted again (the host's Profile entered again, a year switched back), or
// one preloadRegal drew ahead for, wears its Spines and page edges from its
// first frame, nothing fetched or redrawn. Canvases in here are never drawn
// on again; a row that needs another look draws a new one. Bounded: the
// oldest go first. Keys: utils/row/faces.ts rowFaceKeys.

const LIMIT = 300

function bounded() {
  const map = new Map<string, HTMLCanvasElement>()
  return {
    get: (key: string) => map.get(key),
    set(key: string, canvas: HTMLCanvasElement) {
      map.delete(key)
      map.set(key, canvas)
      if (map.size > LIMIT) map.delete(map.keys().next().value!)
    },
    clear: () => map.clear(),
  }
}

/** Spine canvases by spineKey. */
export const rowSpines = bounded()
/** Page-edge canvases by edgeKey. */
export const rowEdges = bounded()

/** What a drawn Spine depends on: the Book, its size, the art, colours and text, the resolution (LOD). */
export function spineKey(bookId: string, scale: number, thickness: number, height: number, art: string | null | undefined, color: string | null | undefined, text: string): string {
  return `${bookId}|${scale}|${thickness.toFixed(5)}|${height.toFixed(5)}|${art ?? '-'}|${color ?? '-'}|${text}`
}

/** What drawn page edges depend on: the Book and its size (their colour comes with the Spine's). */
export function edgeKey(bookId: string, thickness: number, depth: number, art: string | null | undefined, color: string | null | undefined): string {
  return `${bookId}|${thickness.toFixed(5)}|${depth.toFixed(5)}|${art ?? '-'}|${color ?? '-'}`
}
