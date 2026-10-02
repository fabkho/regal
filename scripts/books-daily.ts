// Daily books update: reading tracker → asset set → R2 (books.fabkho.dev).
//
//   pnpm books:daily             # does nothing when nothing changed since the last run
//   pnpm books:daily --force     # rebuild and compare even if the input is unchanged
//   pnpm books:daily --dry-run   # report what changed; no build, no upload
//
// 1. Fingerprints everything the asset set is built from: the tracker's Read
//    shelf (without fields that change daily but are never shown: updatedAt,
//    averageRating, and the private notePath), the overrides file, the Goodreads
//    exports it names, the dev panel's cover picks and the pipeline code. Same
//    fingerprint as the last successful run → exit right away.
// 2. Builds the asset set without AI (`assets:build --limit all --no-ai --no-model`).
// 3. Publishes what a visitor gets (library.json without private fields,
//    manifest.json, each Book's front/spine/back) to the R2 bucket, uploading
//    only files whose content changed since the last publish and deleting ones
//    that are gone. Images first, the JSON last, so the manifest never names an
//    image that isn't there yet.
//
// State: .data/books-daily.json. Bucket: $REGAL_R2_BUCKET (default portfolio-books),
// uploaded with wrangler (`wrangler login` once).
import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs, promisify } from 'node:util'

const { values: args } = parseArgs({
  options: {
    'force': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
})

const ROOT = resolve(import.meta.dirname, '..')
const ASSETS = join(ROOT, 'public/book-assets')
const STATE_FILE = join(ROOT, '.data/books-daily.json')
const BUCKET = process.env.REGAL_R2_BUCKET || 'portfolio-books'
const CLI = process.env.READING_TRACKER_CLI ?? join(homedir(), 'code/reading-tracker-cli/dist/index.js')
const OVERRIDES = process.env.REGAL_OVERRIDES ?? join(homedir(), '.reading-tracker/regal-overrides.json')

/** Tracker fields that change without anything visible changing, or never leave this machine. */
const VOLATILE_FIELDS = new Set(['updatedAt', 'averageRating', 'notePath'])
/** Book fields that never leave the owner's machine. */
const PRIVATE_FIELDS = new Set(['notePath'])
const BOOK_FILES = ['front.webp', 'spine.webp', 'back.webp']
const TYPES: Record<string, { type: string, cache: string }> = {
  // JSON changes with every build; images rarely (same names, so not immutable).
  '.json': { type: 'application/json', cache: 'public, max-age=60' },
  '.webp': { type: 'image/webp', cache: 'public, max-age=86400' },
}
const PARALLEL = 8

interface State {
  input?: string
  inputAt?: string
  /** Published file → sha256 of its content. */
  published?: Record<string, string>
  publishedAt?: string
}

const run = promisify(execFile)
const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')
const expandHome = (path: string) => (path.startsWith('~/') ? join(homedir(), path.slice(2)) : path)
const readState = (): State => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State : {})

function writeState(state: State) {
  mkdirSync(join(ROOT, '.data'), { recursive: true })
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 1)}\n`)
}

const stamp = () => new Date().toLocaleString('sv-SE')

/** Git tree of a pipeline folder at HEAD: a pipeline change rebuilds. */
function treeOf(path: string): string {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: ROOT, encoding: 'utf8' }).trim()
  }
  catch {
    return 'none'
  }
}

/** Everything the asset set is built from, as one hash. */
function inputFingerprint(): string {
  const listed = JSON.parse(execFileSync(process.execPath, [CLI, 'list', '--json', '--shelf', 'read'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })) as { books?: Record<string, unknown>[] } | Record<string, unknown>[]
  const books = (Array.isArray(listed) ? listed : listed.books ?? [])
    .map(book => Object.fromEntries(Object.entries(book).filter(([key]) => !VOLATILE_FIELDS.has(key)).sort(([a], [b]) => a.localeCompare(b))))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))

  const parts: Record<string, string> = { tracker: sha(JSON.stringify(books)) }
  if (existsSync(OVERRIDES)) {
    const text = readFileSync(OVERRIDES, 'utf8')
    parts.overrides = sha(text)
    for (const file of (JSON.parse(text) as { goodreads?: string[] }).goodreads ?? []) {
      const path = resolve(expandHome(file))
      parts[`goodreads:${file}`] = existsSync(path) ? sha(readFileSync(path)) : 'missing'
    }
  }
  const choices = join(ROOT, '.data/choices.json')
  if (existsSync(choices)) parts.picks = sha(JSON.stringify((JSON.parse(readFileSync(choices, 'utf8')) as { editionPicks?: unknown }).editionPicks ?? {}))
  parts.pipeline = ['scripts/assets', 'shared/library', 'shared/types'].map(treeOf).join(',')
  return sha(JSON.stringify(parts))
}

/** What a visitor gets: published key → content. */
function publishSet(): Map<string, Buffer> {
  const files = new Map<string, Buffer>()
  const library = JSON.parse(readFileSync(join(ASSETS, 'library.json'), 'utf8')) as { books?: Record<string, unknown>[] }
  const books = (library.books ?? []).map(book => Object.fromEntries(Object.entries(book).filter(([key]) => !PRIVATE_FIELDS.has(key))))
  files.set('library.json', Buffer.from(`${JSON.stringify({ ...library, books }, null, 1)}\n`))
  files.set('manifest.json', readFileSync(join(ASSETS, 'manifest.json')))
  for (const entry of readdirSync(ASSETS, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    for (const name of BOOK_FILES) {
      const path = join(ASSETS, entry.name, name)
      if (existsSync(path)) files.set(`${entry.name}/${name}`, readFileSync(path))
    }
  }
  return files
}

async function wrangler(...params: string[]) {
  await run('pnpm', ['exec', 'wrangler', ...params], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 })
}

async function upload(key: string, content: Buffer) {
  const ext = key.slice(key.lastIndexOf('.'))
  const kind = TYPES[ext]!
  const tmp = join(ROOT, '.data/upload', key.replaceAll('/', '__'))
  mkdirSync(join(ROOT, '.data/upload'), { recursive: true })
  writeFileSync(tmp, content)
  try {
    await wrangler('r2', 'object', 'put', `${BUCKET}/${key}`, '--file', tmp, '--remote', '--content-type', kind.type, '--cache-control', kind.cache)
  }
  finally {
    rmSync(tmp, { force: true })
  }
}

async function inBatches<T>(items: T[], task: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += PARALLEL) {
    await Promise.all(items.slice(index, index + PARALLEL).map(task))
  }
}

async function main() {
  const state = readState()
  const input = inputFingerprint()
  if (input === state.input && !args.force) {
    console.log(`[${stamp()}] Books: nothing changed since ${state.inputAt ?? 'the last run'}.`)
    return
  }
  console.log(`[${stamp()}] Books: input changed${args.force ? ' (or --force)' : ''}.`)
  if (args['dry-run']) {
    console.log('Dry run: would rebuild the asset set and publish what changed.')
    return
  }

  const build = spawnSync('pnpm', ['exec', 'tsx', 'scripts/assets/build.ts', '--limit', 'all', '--no-ai', '--no-model'], { cwd: ROOT, stdio: 'inherit' })
  if (build.status !== 0) throw new Error(`assets:build failed (exit ${build.status})`)

  const files = publishSet()
  const before = state.published ?? {}
  const hashes = Object.fromEntries([...files].map(([key, content]) => [key, sha(content)]))
  const changed = [...files.keys()].filter(key => before[key] !== hashes[key])
  const gone = Object.keys(before).filter(key => !files.has(key))
  const images = changed.filter(key => !key.endsWith('.json'))
  const json = changed.filter(key => key.endsWith('.json'))

  if (!changed.length && !gone.length) {
    console.log('Built; nothing new to publish.')
  }
  else {
    await inBatches(images, key => upload(key, files.get(key)!))
    for (const key of json) await upload(key, files.get(key)!)
    await inBatches(gone, key => wrangler('r2', 'object', 'delete', `${BUCKET}/${key}`, '--remote'))
    console.log(`Published to r2://${BUCKET}: ${images.length} images, ${json.length} JSON files updated, ${gone.length} removed.`)
  }
  const now = stamp()
  writeState({ input, inputAt: now, published: hashes, publishedAt: changed.length || gone.length ? now : state.publishedAt })
}

main().catch((error: unknown) => {
  console.error(`[${stamp()}] Books: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
