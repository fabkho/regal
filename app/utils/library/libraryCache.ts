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
/** The files being fetched right now. */
const flying = new Set<string>()

/**
 * The library file at `url` (absolute), fetched and read once per page, however many
 * rows ask (they share the request in flight). Only a file that loaded and is valid is
 * kept: a failed fetch (offline, 5xx, CORS), bad JSON or an invalid file is dropped
 * once it settles, so the next call asks again. `fresh` drops what was kept, to read
 * the file anew (a request already in flight is joined, never doubled).
 */
export function fetchLibraryFile(url: string, fresh = false): Promise<LibraryReadResult> {
  if (fresh && !flying.has(url)) {
    files.delete(url)
    read.delete(url)
  }
  let file = files.get(url)
  if (!file) {
    markRegal('library:fetch')
    const request: Promise<LibraryReadResult> = fetch(url, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim())
        return response.text()
      })
      .then((text) => {
        const result = readLibraryFile(text)
        if (result.ok) read.set(url, result)
        return result
      })
    file = request
    flying.add(url)
    const settled = (kept: boolean) => {
      // Not a newer request for the same file.
      if (files.get(url) === request) {
        flying.delete(url)
        if (!kept) files.delete(url)
      }
    }
    request.then(result => settled(result.ok), () => settled(false))
    files.set(url, request)
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
  flying.clear()
}
