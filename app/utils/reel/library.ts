// A reel's own Library (RegalBooksReel, RegalBooksReelStill): a document in
// memory, read as the library file is, its Books in the document's order and
// their faces resolved against the document (only absolute http(s) URLs
// load). Shared by the reel and its still, so both dress the same Books the
// same way, on the server too (the reel's poster is part of the server's HTML).
import type { Book } from '#layers/regal/shared/types/book'
import { assetFaces } from '#layers/regal/app/utils/covers/bookAssets'
import type { AssetFaces } from '#layers/regal/app/utils/covers/bookAssets'
import { memorySource, readLibraryDocument, resolveLibraryUrl } from '#layers/regal/app/utils/library/libraryFile'
import type { LibraryLoadError, LibraryReadResult } from '#layers/regal/app/utils/library/libraryFile'

export interface ReelLibrary {
  read: LibraryReadResult | null
  books: Book[]
  error: LibraryLoadError | null
}

/** The document read: its Books (none when it is invalid, then `error` says why). */
export function readReelLibrary(library: object | null | undefined): ReelLibrary {
  const read = library ? readLibraryDocument(library) : null
  return {
    read,
    books: read?.ok ? read.library.books : [],
    error: read && !read.ok ? read.error : null,
  }
}

/** A Book's faces from the document (never the shared Library's: ids can collide). */
export function reelFacesOf(library: object | null | undefined, read: LibraryReadResult | null): (bookId: string) => AssetFaces | null {
  return (bookId) => {
    if (!read?.ok || !library) return null
    const entry = read.library.assets[bookId]
    if (!entry) return null
    const src = memorySource(library)
    // A memory document has no URL to be relative to: the page never matters, only absolute references load.
    const page = import.meta.client ? window.location.href : 'http://localhost/'
    return assetFaces(entry, reference => resolveLibraryUrl(reference, src, page))
  }
}
