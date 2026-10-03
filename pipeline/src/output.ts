// The enriched library file: the input with each Book's `assets` (and any
// filled-in words) from its record, validated before it is written.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BookRecord } from './enrich'
import type { LibraryBook, LibraryBookAssets, RegalLibraryFile } from './layer'
import { formatLibraryFileErrors, LIBRARY_FILE_VERSION, validateLibraryFile } from './layer'
import { compact, writeIfChanged } from './util'

export const LIBRARY_FILE = 'library.json'
export const GENERATOR = 'regal-assets'

const TEXT_FIELDS = ['description', 'publisher', 'genre', 'quotes'] as const

/** Image references of an assets object, rewritten (for Books passed through as they came). */
export function mapRefs(assets: LibraryBookAssets, rewrite: (ref: string) => string): LibraryBookAssets {
  const ref = (value: string | null | undefined) => (value ? rewrite(value) : value)
  const result: LibraryBookAssets = { ...assets, front: ref(assets.front), spine: ref(assets.spine), back: ref(assets.back) }
  if (assets.pile) result.pile = { ...assets.pile, front: ref(assets.pile.front), spine: ref(assets.pile.spine) }
  return compact(result)
}

/**
 * One Book of the output: the input Book (every field it has stays, unknown
 * ones too) with the record's assets and the words it lacked. Without a
 * record (not processed this run) its own assets, re-based on the output.
 */
export function enrichedBook(book: LibraryBook, record: BookRecord | null, rebase: (ref: string) => string): LibraryBook {
  const result: LibraryBook = { ...book }
  if (!record) {
    if (book.assets) result.assets = mapRefs(book.assets, rebase)
  }
  else {
    for (const field of TEXT_FIELDS) {
      const value = record.text[field]
      const missing = field === 'quotes' ? !book.quotes?.length : !book[field]?.trim()
      if (value && missing) (result as unknown as Record<string, unknown>)[field] = value
    }
    const { front, spine, back, pile, palette, spineColor, photoFaces, source, ...rest } = record.assets
    result.assets = compact({ front, spine, back, pile, palette, spineColor, photoFaces, source, ...rest })
  }
  if (result.assets && !Object.keys(result.assets).length) delete result.assets
  return result
}

/** The output file around the enriched Books (the input's own top-level fields kept). */
export function assembleLibrary(input: RegalLibraryFile, books: LibraryBook[], generatedAt: string): RegalLibraryFile {
  return {
    ...input,
    version: LIBRARY_FILE_VERSION,
    generatedAt,
    generator: !input.generator || input.generator === GENERATOR ? GENERATOR : input.generator.startsWith(`${GENERATOR} (from `) ? input.generator : `${GENERATOR} (from ${input.generator})`,
    books,
  }
}

const text = (library: RegalLibraryFile) => `${JSON.stringify(library, null, 2)}\n`

/**
 * Validates and writes `<out>/library.json`. When only `generatedAt` would
 * change, the previous file stays as it is (a run without changes publishes
 * nothing). Throws with the validator's errors when the result is invalid.
 */
export function writeLibrary(out: string, library: RegalLibraryFile): { library: RegalLibraryFile, written: boolean, path: string } {
  const result = validateLibraryFile(library)
  if (!result.ok) {
    throw new Error(`The enriched file is invalid; nothing written:\n${formatLibraryFileErrors(result.errors).map(line => `  ${line}`).join('\n')}`)
  }
  const path = join(out, LIBRARY_FILE)
  let final = library
  if (existsSync(path)) {
    try {
      const previous = JSON.parse(readFileSync(path, 'utf8')) as RegalLibraryFile
      if (text({ ...library, generatedAt: previous.generatedAt }) === text(previous)) final = previous
    }
    catch {
      // An unreadable previous file is simply replaced.
    }
  }
  return { library: final, written: writeIfChanged(path, text(final)), path }
}
