// preloadReelCovers: a host warms the Covers RegalBooksReel's first frame shows,
// as soon as it has the Library (a member's "You both read" once its data is in),
// before the reel's chunk (three.js, TresJS and Regal) has even arrived. The
// Covers are fetched at once, the one in front first and at high priority, and
// kept for the canvas: its textures take these bytes (utils/covers/images.ts
// `fetchImage`) instead of asking again, and the poster's own <img>s (same URL,
// same CORS request) find them in the browser's cache once the server's HTML
// or the reel's mount asks. Light on purpose: no three.js, no TresJS.
//
// Safe to call any number of times, before any reel exists, and on the server
// (where it does nothing).
import type { Book } from '#layers/regal/shared/types/book'
import type { RegalLibraryFile } from '#layers/regal/shared/types/libraryFile'
import type { AssetFaces } from '#layers/regal/app/utils/covers/bookAssets'
import { preloadImage } from '#layers/regal/app/utils/covers/images'
import { posterBooks } from '#layers/regal/app/utils/reel/poster'
import { readReelLibrary, reelFacesOf } from '#layers/regal/app/utils/reel/library'
import { reelStartFrame } from '#layers/regal/app/utils/reel/state'

export interface PreloadReelCoversOptions {
  /** The reel's `autoplay` and `reduced-motion` (they decide which Books its first frame shows). */
  autoplay?: boolean
  reducedMotion?: boolean
}

export interface ReelCoverRequest {
  url: string
  /** The Book in front of the first frame is the one that matters most. */
  priority: 'high' | 'auto'
}

/**
 * The Covers the reel's first frame shows, in the order to ask for them: the Book in front, then
 * the others nearest it. The images the poster draws and the canvas loads first (a Book's pile
 * copy, else its front).
 */
export function reelCoverRequests(library: RegalLibraryFile | Record<string, unknown> | null | undefined, options: PreloadReelCoversOptions = {}): ReelCoverRequest[] {
  const { read, books } = readReelLibrary(library)
  if (!library || !books.length) return []
  const { focus } = reelStartFrame(books.length, { reduced: options.reducedMotion, autoplay: options.autoplay })
  return coverRequestsAt(books, reelFacesOf(library, read), focus)
}

/** `reelCoverRequests` for Books and faces already in hand (the card's), the arc standing at `focus`. */
export function coverRequestsAt(books: Book[], faces: (bookId: string) => AssetFaces | null, focus: number): ReelCoverRequest[] {
  const shown = posterBooks(books.length, focus).sort((a, b) => Math.abs(a.pose.distance) - Math.abs(b.pose.distance))
  const seen = new Set<string>()
  const requests: ReelCoverRequest[] = []
  for (const { index, pose } of shown) {
    const set = faces(books[index]!.id)
    const cover = set?.pileFront ?? set?.front
    if (!cover || seen.has(cover)) continue
    seen.add(cover)
    requests.push({ url: cover, priority: Math.abs(pose.distance) < 0.5 ? 'high' : 'auto' })
  }
  return requests
}

const asked = new WeakMap<object, Promise<void>>()

/**
 * Starts fetching the first frame's Covers. Resolves once they are in (or failed); never rejects.
 * One call per Library object does the work (a new object is another Library).
 */
export function preloadReelCovers(library: RegalLibraryFile | Record<string, unknown> | null | undefined, options: PreloadReelCoversOptions = {}): Promise<void> {
  if (import.meta.server || typeof window === 'undefined' || !library) return Promise.resolve()
  const known = asked.get(library)
  if (known) return known
  const run = Promise.all(reelCoverRequests(library, options).map(request => preloadImage(request.url, request.priority))).then(() => {})
  asked.set(library, run)
  return run
}
