// What Regal assets takes from the Regal layer next door (this repo's root):
// the library file's types and validator, and the pure helpers the display
// draws with, so the pipeline's colours and Spine sizes match what it shows.
// Plain relative imports: the layer's files are pure TypeScript without Nuxt
// imports, so the pipeline needs none of the layer's dependencies.
export type { Book } from '../../shared/types/book'
export { LIBRARY_FILE_VERSION } from '../../shared/types/libraryFile'
export type { LibraryBook, LibraryBookAssets, LibraryBookFace, LibraryFileError, LibraryPalette, LibraryQuote, RegalLibraryFile } from '../../shared/types/libraryFile'
export { formatLibraryFileErrors, libraryBookToBook, parseLibraryFile, validateLibraryFile } from '../../shared/library/libraryFile'
export { spinePalette, toHex } from '../../app/utils/covers/palette'
export { bookDimensions } from '../../app/utils/bookcase/layout'
