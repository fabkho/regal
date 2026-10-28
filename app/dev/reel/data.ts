// Dev only (/dev/reel): the reel prototype's twelve synthetic Books
// (libellus-ref/shared-books-reel-proto/data.js: invented titles, authors and
// ratings; its covers are ours, drawn from shapes, in demo/covers/reel-*.jpg)
// as an in-memory library document, the way Libellus hands a member's
// "You both read" to RegalBooksReel. Pure; not part of the layer's surface.
import type { RegalLibraryFile } from '#layers/regal/shared/types/libraryFile'

export interface ReelSample {
  id: string
  title: string
  author: string
  /** The cover's ground: the Book's one colour (flat Spine and back). */
  color: string
  /** Her rating and yours, in quarter stars (0..20) as the prototype keeps them; null: not shown. */
  hers: number | null
  mine: number | null
}

export const REEL_SAMPLES: readonly ReelSample[] = Object.freeze([
  { id: 'reel-01', title: 'The Salt Road', author: 'Mara Ellison', color: '#e2a04a', hers: 18, mine: 20 },
  { id: 'reel-02', title: 'White Hours', author: 'Jonas Riedel', color: '#f4f1ea', hers: 16, mine: 14 },
  { id: 'reel-03', title: 'Harbour of Glass', author: 'Iris Okafor', color: '#1f3f5b', hers: 20, mine: 18 },
  { id: 'reel-04', title: 'Yellow Kite', author: 'Paul Brandt', color: '#f6c90e', hers: 12, mine: 12 },
  { id: 'reel-05', title: 'Night Freight', author: 'Vera Lang', color: '#0b0b0d', hers: null, mine: 16 },
  { id: 'reel-06', title: 'The Quiet Archive', author: 'Hugo Thalberg', color: '#14254a', hers: 17, mine: 19 },
  { id: 'reel-07', title: 'Seagrass', author: 'Klara Winter', color: '#7fb6a4', hers: 14, mine: 10 },
  { id: 'reel-08', title: 'Copper Island', author: 'Felix Adler', color: '#c56b2a', hers: 19, mine: 19 },
  { id: 'reel-09', title: 'Grey Weather', author: 'Rosa Keller', color: '#8a8a88', hers: 15, mine: 16 },
  { id: 'reel-10', title: 'Neon Saints', author: 'Zoe Quast', color: '#ff1fa8', hers: 20, mine: 18 },
  { id: 'reel-11', title: 'Blue Hour Signal', author: 'Noah Iversen', color: '#2ec4f1', hers: 13, mine: 15 },
  { id: 'reel-12', title: 'The Long Forest', author: 'Greta Pohl', color: '#3d6b35', hers: 16, mine: 12 },
])

/** How many Books the page can show: none, one, the arcs with ends, a ringing one. */
export const REEL_COUNTS = [0, 1, 2, 3, 12] as const

/**
 * The first `count` samples as a library document (only what Libellus would
 * send: id, title, author, status, its colour and front; no rating, no blurb).
 * `base`: the absolute URL the covers are under (an in-memory document's
 * images must be absolute).
 */
export function reelLibrary(count: number, base: string): RegalLibraryFile {
  return {
    version: 2,
    generatedAt: '2026-10-28T00:00:00Z',
    owner: 'Lena Hartmann',
    generator: 'Regal /dev/reel (synthetic)',
    books: REEL_SAMPLES.slice(0, Math.max(0, count)).map(sample => ({
      id: sample.id,
      title: sample.title,
      authors: [sample.author],
      status: 'read',
      rating: 0,
      assets: { color: sample.color, front: new URL(`covers/${sample.id}.jpg`, base).href },
    })),
  }
}

/** The prototype's rating text: quarter stars to "4.5" / "4.25" (lib.js `ratingText`). */
export function ratingText(quarters: number | null): string {
  return quarters === null ? '–' : (quarters / 4).toFixed(quarters % 2 ? 2 : 1)
}
