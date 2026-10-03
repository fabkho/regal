// Loads the images an input library file names: absolute URLs (downloaded
// once into the cache, revalidated on request) or files next to a local input.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'
import sharp from 'sharp'
import { USER_AGENT } from './resolvers/covers'
import { isHttpUrl, sha256, writeIfChanged } from './util'

export interface LoadedImage {
  bytes: Buffer
  sha: string
  width: number
  height: number
  /** sharp's format name: webp, jpeg, png … */
  format: string
  /** Where it came from: an absolute URL or file path. */
  location: string
}

/** Where the input file is: its URL, or its path on disk. */
export type InputBase = { url: string } | { path: string }

/**
 * An image reference of the input file as an absolute URL or file path, the
 * way a page at the file's address would resolve it; null when it can't be
 * (a root-relative path next to a local file).
 */
export function resolveRef(ref: string, base: InputBase): string | null {
  if (isHttpUrl(ref)) return ref
  if (ref.startsWith('//')) return `https:${ref}`
  if ('url' in base) return new URL(ref, base.url).href
  if (ref.startsWith('/')) return null
  return resolvePath(base.path, '..', decodeURIComponent(ref.split(/[?#]/)[0]!))
}

interface CachedDownload { url: string, sha: string, etag?: string | null, lastModified?: string | null }

export interface LoaderOptions {
  /** Downloads go to `<cacheDir>/downloads`. */
  cacheDir: string
  /** Ask the server whether a cached download changed (conditional GET). */
  revalidate?: boolean
  fetch?: typeof fetch
}

export class ImageLoader {
  private readonly memo = new Map<string, Promise<LoadedImage | null>>()
  private readonly dir: string
  private readonly fetch: typeof fetch
  /** Locations that failed this run, with the reason. */
  readonly failures = new Map<string, string>()

  constructor(private readonly options: LoaderOptions) {
    this.dir = join(options.cacheDir, 'downloads')
    this.fetch = options.fetch ?? fetch
  }

  load(location: string): Promise<LoadedImage | null> {
    let pending = this.memo.get(location)
    if (!pending) {
      pending = this.read(location).then(bytes => (bytes ? this.describe(location, bytes) : null))
      this.memo.set(location, pending)
    }
    return pending
  }

  private async describe(location: string, bytes: Buffer): Promise<LoadedImage | null> {
    try {
      const meta = await sharp(bytes).metadata()
      if (!meta.width || !meta.height) throw new Error('no size')
      return { bytes, sha: sha256(bytes), width: meta.width, height: meta.height, format: meta.format ?? 'unknown', location }
    }
    catch {
      this.failures.set(location, 'not an image')
      return null
    }
  }

  private async read(location: string): Promise<Buffer | null> {
    if (!isHttpUrl(location)) {
      if (existsSync(location)) return readFileSync(location)
      this.failures.set(location, 'file not found')
      return null
    }
    const key = sha256(location)
    const file = join(this.dir, key)
    const metaFile = `${file}.json`
    const cached = existsSync(file) && existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) as CachedDownload : null
    if (cached && !this.options.revalidate) return readFileSync(file)

    const headers: Record<string, string> = { 'User-Agent': USER_AGENT }
    if (cached?.etag) headers['If-None-Match'] = cached.etag
    else if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified
    try {
      const response = await this.fetch(location, { headers, signal: AbortSignal.timeout(30_000) })
      if (response.status === 304 && cached) return readFileSync(file)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      writeIfChanged(file, bytes)
      const meta: CachedDownload = { url: location, sha: sha256(bytes), etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified') }
      writeIfChanged(metaFile, `${JSON.stringify(meta, null, 1)}\n`)
      return bytes
    }
    catch (error) {
      if (cached) return readFileSync(file)
      this.failures.set(location, error instanceof Error ? error.message : String(error))
      return null
    }
  }
}
