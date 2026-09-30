// Asset pipeline (#25): the latest N finished Books from the reading tracker
// (or a Library export file) → high-res front, clean blurb, AI back + spine,
// written as an asset set (#20) under public/book-assets/.
//
//   pnpm assets:build                     # latest 10 read Books from `reading list --json`
//   pnpm assets:build --limit 3 --dry-run # what would happen, and what it would cost
//   pnpm assets:build --from library.json # a Library export instead of the CLI
//   pnpm assets:build --no-ai             # fronts + blurbs only (free)
//   pnpm assets:build --force             # rebuild even if a Book is done
//   pnpm assets:build --recrop            # re-cut spine/back from stored jackets (free)
//
// Idempotent: a Book whose asset set exists (same prompt version) is skipped,
// so re-runs only cost for new Books.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import sharp from 'sharp'
import type { Book } from '../../shared/types/book'
import { importLibrary } from '../../shared/library/importLibrary'
import type { ReadingTrackerBook } from '../../shared/library/importReadingTracker'
import { resolveBlurb } from './blurb'
import { resolveFront } from './front'
import { IMAGE_COST_USD, IMAGE_MODEL } from './gemini'
import { cropJacket, generateJacket, layoutFor, planLayout, PROMPT_VERSION, spineRatio } from './jacket'

const { values: args } = parseArgs({
  options: {
    'from': { type: 'string' },
    'shelf': { type: 'string', default: 'read' },
    'limit': { type: 'string', default: '10' },
    'out': { type: 'string', default: 'public/book-assets' },
    'dry-run': { type: 'boolean', default: false },
    'no-ai': { type: 'boolean', default: false },
    'force': { type: 'boolean', default: false },
    'recrop': { type: 'boolean', default: false },
  },
})

const OUT = resolve(args.out!)
const CLI = process.env.READING_TRACKER_CLI ?? join(homedir(), 'code/reading-tracker-cli/dist/index.js')

interface ManifestEntry {
  front?: string
  spine?: string
  back?: string
  description?: string
  source?: 'photo' | 'ai'
  meta?: Record<string, unknown>
}

/** Raw source entries (kept for library.json) plus normalized Books. */
function loadSource(): { raw: ReadingTrackerBook[] | null, books: Book[] } {
  let text: string
  if (args.from) {
    text = readFileSync(resolve(args.from), 'utf8')
  }
  else {
    console.log(`Reading tracker: ${CLI} list --json --shelf ${args.shelf}`)
    text = execFileSync(process.execPath, [CLI, 'list', '--json', '--shelf', args.shelf!], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  }
  const { books } = importLibrary(text)
  const parsed = text.trimStart().startsWith('{') || text.trimStart().startsWith('[') ? JSON.parse(text) : null
  const raw = parsed ? (Array.isArray(parsed) ? parsed : parsed.books) as ReadingTrackerBook[] : null
  return { raw, books }
}

const keyOf = (book: Book) => book.isbn13 ?? book.id

function readManifest(): Record<string, ManifestEntry> {
  const path = join(OUT, 'manifest.json')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
}

async function main() {
  const { raw, books } = loadSource()
  const selected = books
    .filter(book => book.status === args.shelf && book.dateRead)
    .sort((a, b) => (a.dateRead! < b.dateRead! ? 1 : -1))
    .slice(0, Number(args.limit))
  if (!selected.length) throw new Error(`No finished Books on shelf "${args.shelf}"`)

  mkdirSync(OUT, { recursive: true })
  const manifest = readManifest()
  const report: Record<string, unknown>[] = []
  let images = 0

  for (const book of selected) {
    const key = keyOf(book)
    const dir = join(OUT, key)
    const existing = manifest[key]
    if (args.recrop) {
      if (!existsSync(join(dir, 'jacket.webp')) || !existsSync(join(dir, 'front.webp'))) continue
      const cut = await cropJacket(readFileSync(join(dir, 'jacket.webp')), await layoutFor(book, readFileSync(join(dir, 'front.webp'))))
      writeFileSync(join(dir, 'spine.webp'), await sharp(cut.spine).resize({ height: 1600, withoutEnlargement: true }).webp({ quality: 90 }).toBuffer())
      writeFileSync(join(dir, 'back.webp'), await sharp(cut.back).resize({ height: 1600, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer())
      manifest[key] = { ...existing, meta: { ...existing?.meta, spineFit: Number(cut.spineFit.toFixed(2)), stretched: cut.stretched } }
      console.log(`✂ ${book.title}: spine fit ${Math.round(cut.spineFit * 100)}%${cut.stretched ? ' (detected folds)' : ''}`)
      continue
    }
    const done = existing?.front && existing.description !== undefined && (args['no-ai'] || (existing.back && existing.meta?.promptVersion === PROMPT_VERSION))
    const label = `${book.dateRead}  ${book.title}`
    if (done && !args.force) {
      console.log(`✓ ${label} (cached)`)
      report.push({ book: book.title, cached: true })
      continue
    }
    const needsAi = !args['no-ai'] && !(existing?.back && existing.meta?.promptVersion === PROMPT_VERSION && !args.force)
    if (args['dry-run']) {
      console.log(`• ${label}  → front + blurb${needsAi ? ` + AI back/spine ($${IMAGE_COST_USD})` : ''}`)
      if (needsAi) images++
      continue
    }

    console.log(`→ ${label}`)
    mkdirSync(dir, { recursive: true })
    const front = await resolveFront(book)
    if (!front) {
      console.warn('  no front found; skipped')
      report.push({ book: book.title, error: 'no front' })
      continue
    }
    const frontWebp = await sharp(front.image).resize({ height: 1600, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer()
    writeFileSync(join(dir, 'front.webp'), frontWebp)
    console.log(`  front: ${front.source} ${front.width}×${front.height}`)

    const blurb = await resolveBlurb(front.appleDescription, book.description)
    console.log(`  blurb: ${blurb.source} via ${blurb.method}, ${blurb.text.length} chars: ${JSON.stringify(blurb.text.slice(0, 80))}…`)

    const entry: ManifestEntry = {
      ...existing,
      front: `${key}/front.webp`,
      description: blurb.text,
      meta: { ...existing?.meta, title: book.title, frontSource: front.source, frontSize: `${front.width}x${front.height}`, blurbSource: blurb.source, blurbMethod: blurb.method },
    }

    if (needsAi) {
      const layout = planLayout(front.width / front.height, spineRatio(book))
      console.log(`  AI: ${layout.ratio} canvas, spine ${layout.spineWidth}px … (${IMAGE_MODEL}, ~$${IMAGE_COST_USD})`)
      const started = Date.now()
      const jacket = await generateJacket(book, front.image)
      images++
      writeFileSync(join(dir, 'jacket.webp'), jacket.jacket)
      writeFileSync(join(dir, 'spine.webp'), await sharp(jacket.spine).resize({ height: 1600, withoutEnlargement: true }).webp({ quality: 90 }).toBuffer())
      writeFileSync(join(dir, 'back.webp'), await sharp(jacket.back).resize({ height: 1600, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer())
      Object.assign(entry, { spine: `${key}/spine.webp`, back: `${key}/back.webp`, source: 'ai' })
      entry.meta = { ...entry.meta, promptVersion: PROMPT_VERSION, model: IMAGE_MODEL, spineFit: Number(jacket.spineFit.toFixed(2)), stretched: jacket.stretched }
      console.log(`  AI: done in ${Math.round((Date.now() - started) / 1000)} s, spine fit ${Math.round(jacket.spineFit * 100)}%${jacket.stretched ? ' (stretched)' : ''}`)
    }

    manifest[key] = entry
    writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`)
    report.push({ book: book.title, ...entry.meta })
  }

  if (args.recrop) {
    writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`)
    return
  }
  if (args['dry-run']) {
    console.log(`\nDry run: ${images} AI image(s), about $${(images * IMAGE_COST_USD).toFixed(2)} (Batch API: half).`)
    return
  }

  // The selected Books as a Library export for Regal (dev button "My latest"), blurbs cleaned.
  const ids = new Set(selected.map(book => book.id))
  const library = raw
    ? raw.filter(entry => ids.has(entry.id)).map((entry) => {
        const book = selected.find(item => item.id === entry.id)!
        return { ...entry, description: manifest[keyOf(book)]?.description ?? entry.description }
      })
    : null
  if (library) writeFileSync(join(OUT, 'library.json'), `${JSON.stringify({ books: library, total: library.length }, null, 1)}\n`)

  console.log(`\n${selected.length} Books, ${images} AI image(s) ≈ $${(images * IMAGE_COST_USD).toFixed(2)}. Manifest: ${join(OUT, 'manifest.json')}`)
  writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
