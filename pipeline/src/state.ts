// What Regal assets remembers between runs (`<cache>/state.json`): each
// Book's asset record and, per bucket and prefix, the hashes of what was
// published there.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BookRecord } from './enrich'
import { writeIfChanged } from './util'

export interface State {
  version: 1
  /** The output folder the records describe; another one starts fresh. */
  out?: string
  /** Asset key → record. */
  books: Record<string, BookRecord>
  /** `bucket/prefix` → published file → sha256. */
  published: Record<string, Record<string, string>>
  publishedAt: Record<string, string>
}

const empty = (): State => ({ version: 1, books: {}, published: {}, publishedAt: {} })
const fileOf = (cacheDir: string) => join(cacheDir, 'state.json')

export function readState(cacheDir: string, out: string): State {
  const file = fileOf(cacheDir)
  if (!existsSync(file)) return { ...empty(), out }
  const state = { ...empty(), ...JSON.parse(readFileSync(file, 'utf8')) as Partial<State> }
  if (state.out !== out) return { ...state, out, books: {} }
  return state
}

export function writeState(cacheDir: string, state: State): void {
  writeIfChanged(fileOf(cacheDir), `${JSON.stringify(state, null, 1)}\n`)
}
