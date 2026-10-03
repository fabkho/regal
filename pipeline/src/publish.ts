// Publishing: the output folder's library file and the images it names go to
// the R2 bucket under a prefix (`v2/`), uploading only files whose content
// changed since the last publish there and deleting ones that are gone. The
// images first, the library file last, so it never names an image that isn't
// there yet. Files outside the prefix (today's root files) are never touched:
// only keys this step uploaded itself are ever deleted, and an empty prefix is
// refused.
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { RegalLibraryFile } from './layer'
import { LIBRARY_FILE } from './output'
import { isHttpUrl, pool, sha256 } from './util'

export const DEFAULT_BUCKET = 'portfolio-books'

const TYPES: Record<string, { type: string, cache: string }> = {
  // The library file changes with every build; images rarely (same names, so not immutable).
  '.json': { type: 'application/json', cache: 'public, max-age=60' },
  '.webp': { type: 'image/webp', cache: 'public, max-age=86400' },
}

/** `v2`, `v2/`, `/v2` → `v2`. Throws for the bucket root or anything odd. */
export function checkPrefix(prefix: string | undefined): string {
  const clean = (prefix ?? '').trim().replace(/^\/+|\/+$/g, '')
  if (!clean) throw new Error('--publish needs a prefix (e.g. v2): the bucket root holds today\'s files and is never written')
  if (!/^[\w-]+(?:\/[\w-]+)*$/.test(clean)) throw new Error(`--publish: "${prefix}" is not a folder name (letters, digits, - and _; / between levels)`)
  return clean
}

/**
 * What a visitor gets: the library file and every image it names in the
 * output folder (output-relative name → path). Throws when the file names a
 * local image that isn't there or lies outside the folder: publishing it would
 * leave the published file pointing at nothing.
 */
export function publishSet(out: string, library: RegalLibraryFile): Map<string, string> {
  const files = new Map<string, string>([[LIBRARY_FILE, join(out, LIBRARY_FILE)]])
  const problems: string[] = []
  for (const book of library.books) {
    const assets = book.assets
    for (const ref of [assets?.front, assets?.spine, assets?.back, assets?.pile?.front, assets?.pile?.spine]) {
      if (!ref || isHttpUrl(ref) || ref.startsWith('//')) continue
      const path = join(out, ref)
      if (ref.startsWith('/') || ref.split('/').includes('..') || !existsSync(path)) problems.push(`${book.id}: ${ref}`)
      else files.set(ref, path)
    }
  }
  if (problems.length) {
    throw new Error(`Not published: the library file names ${problems.length} image(s) that aren't in ${out} (re-run without --limit, or with --force):\n${problems.slice(0, 10).map(line => `  ${line}`).join('\n')}`)
  }
  return files
}

export interface PublishPlan {
  images: string[]
  json: string[]
  gone: string[]
}

/** Which files to upload and delete, from their hashes now and at the last publish. Pure. */
export function planPublish(hashes: Record<string, string>, before: Record<string, string>): PublishPlan {
  const changed = Object.keys(hashes).filter(name => before[name] !== hashes[name]).sort()
  return {
    images: changed.filter(name => !name.endsWith('.json')),
    json: changed.filter(name => name.endsWith('.json')),
    gone: Object.keys(before).filter(name => !(name in hashes)).sort(),
  }
}

export interface Uploader {
  put: (key: string, file: string, type: string, cacheControl: string) => Promise<void>
  remove: (key: string) => Promise<void>
}

/** Uploads with wrangler (`wrangler login` once), as the daily job does today. */
export function wranglerUploader(bucket: string, cwd: string): Uploader {
  const run = promisify(execFile)
  const wrangler = (...params: string[]) => run('pnpm', ['exec', 'wrangler', ...params], { cwd, maxBuffer: 16 * 1024 * 1024 })
  return {
    put: async (key, file, type, cacheControl) => {
      await wrangler('r2', 'object', 'put', `${bucket}/${key}`, '--file', file, '--remote', '--content-type', type, '--cache-control', cacheControl)
    },
    remove: async (key) => {
      await wrangler('r2', 'object', 'delete', `${bucket}/${key}`, '--remote')
    },
  }
}

export interface PublishOptions {
  out: string
  library: RegalLibraryFile
  prefix: string
  /** Hashes of the last publish under this bucket and prefix. */
  before: Record<string, string>
  /** Report only: nothing is uploaded or deleted. */
  dryRun: boolean
  uploader: Uploader
  log: (line: string) => void
}

/** Publishes what changed; returns the plan and the hashes to remember (unchanged ones on a dry run). */
export async function publish(options: PublishOptions): Promise<{ plan: PublishPlan, hashes: Record<string, string> }> {
  const prefix = checkPrefix(options.prefix)
  const files = publishSet(options.out, options.library)
  const hashes = Object.fromEntries([...files].map(([name, path]) => [name, sha256(readFileSync(path))]))
  const plan = planPublish(hashes, options.before)
  const where = `${prefix}/`
  if (!plan.images.length && !plan.json.length && !plan.gone.length) {
    options.log(`Publish ${where}: nothing changed.`)
    return { plan, hashes }
  }
  if (options.dryRun) {
    options.log(`Dry run, nothing uploaded: would publish to ${where} ${plan.images.length} image(s), ${plan.json.length} JSON file(s), delete ${plan.gone.length}.`)
    return { plan, hashes: options.before }
  }
  const put = (name: string) => {
    const type = TYPES[name.slice(name.lastIndexOf('.'))] ?? { type: 'application/octet-stream', cache: 'public, max-age=60' }
    return options.uploader.put(`${prefix}/${name}`, files.get(name)!, type.type, type.cache)
  }
  await pool(plan.images, 8, put)
  for (const name of plan.json) await put(name)
  await pool(plan.gone, 8, name => options.uploader.remove(`${prefix}/${name}`))
  options.log(`Published to ${where}: ${plan.images.length} image(s), ${plan.json.length} JSON file(s) updated, ${plan.gone.length} removed.`)
  return { plan, hashes }
}
