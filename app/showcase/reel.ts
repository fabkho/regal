// The playground's reel (/playground, Regal's own site only): RegalBooksReel
// takes its Library as a document in memory, so the playground hands it the
// Library it shows (the showcase shelf, the demo, a URL, a dropped file) as
// one: the newest Books read or being read, at most `limit`, every image
// reference made absolute against the library file's URL (relative ones
// would not load from memory). Pure; not auto-imported.
import type { Book } from '#layers/regal/shared/types/book'
import type { LibraryBook, RegalLibraryFile } from '#layers/regal/shared/types/libraryFile'
import type { BookAssetEntry } from '#layers/regal/app/utils/covers/bookAssets'
import { resolveLibraryUrl } from '#layers/regal/app/utils/library/libraryFile'
import { rowBooks } from '#layers/regal/app/utils/row/layout'

/** The reel's Books by default: the prototype's twelve. */
export const REEL_DEFAULT_LIMIT = 12

export function reelDocument(
  books: Book[],
  assets: Record<string, BookAssetEntry>,
  src: string,
  page: string,
  limit: number | null = null,
): RegalLibraryFile {
  const at = (reference: string | undefined) => (reference ? resolveLibraryUrl(reference, src, page) ?? undefined : undefined)
  const shown = rowBooks(books, { limit: limit ?? REEL_DEFAULT_LIMIT, year: null })
  return {
    version: 2,
    generatedAt: new Date(0).toISOString(),
    books: shown.map((book): LibraryBook => {
      const entry = assets[book.id]
      return {
        id: book.id,
        title: book.title,
        seriesTitle: book.seriesTitle,
        authors: [book.author, ...book.additionalAuthors].filter((name): name is string => !!name),
        isbn13: book.isbn13,
        pages: book.pages,
        binding: book.binding,
        status: book.status,
        dateRead: book.dateRead,
        rating: book.rating,
        description: book.description,
        assets: entry
          ? {
              front: at(entry.front),
              spine: at(entry.spine),
              back: at(entry.back),
              pile: entry.pile ? { front: at(entry.pile.front), spine: at(entry.pile.spine) } : undefined,
              palette: entry.palette,
              spineColor: entry.spineColor,
              color: entry.color,
            }
          : undefined,
      }
    }),
  }
}
