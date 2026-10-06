// Library files the browser fetched in this page, by absolute URL (module
// level): fetched and read once, however many rows mount, and filled early
// by preloadRegal (utils/preload.ts). useRegalLibrary reads it in the
// browser; a file already read shows in the row's first render.
import { readLibraryFile } from '#layers/regal/app/utils/library/libraryFile'
import type { LibraryReadResult } from '#layers/regal/app/utils/library/libraryFile'
import { markRegal } from '#layers/regal/app/utils/stage/marks'

const files = new Map<string, Promise<LibraryReadResult>>()
/** The files read so far, for a synchronous look. */
const read = new Map<string, LibraryReadResult>()

/** The library file at `url` (absolute), fetched and read once per page; a failed fetch is tried again next time. */
export function fetchLibraryFile(url: string): Promise<LibraryReadResult> {
  let file = files.get(url)
  if (!file) {
    markRegal('library:fetch')
    file = fetch(url, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim())
        return response.text()
      })
      .then((text) => {
        const result = readLibraryFile(text)
        read.set(url, result)
        return result
      })
    file.catch(() => files.delete(url))
    files.set(url, file)
  }
  return file
}

/** The library file at `url` if it has been read already in this page (no fetch). */
export function readLibraryFileNow(url: string): LibraryReadResult | null {
  return read.get(url) ?? null
}

/** Forgets every file (tests). */
export function clearLibraryFiles() {
  files.clear()
  read.clear()
}
