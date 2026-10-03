// Regal assets: a Regal library file in → the same file with its Books'
// images and colours out, plus the images, optionally published to R2.
//
//   pnpm --dir pipeline assets --in <file|url> [--out <dir>] [options]
//   pnpm regal-assets --in <file|url> …        (the same, from the repo root)
//
//   --in <file|url>     the library file to enrich (validated first)
//   --out <dir>         output folder: library.json + <key>/{front,spine,back,front-pile,spine-pile}.webp
//                       (default .data/regal-assets/out)
//   --cache <dir>       downloads, AI jackets, batch jobs, state (default .data/regal-assets)
//   --photos <dir>      photo drop-ins: <dir>/<key>/front.jpg … (default <cache>/photos)
//   --limit <n|all>     enrich only the n most recently read Books this run (default all)
//   --no-ai             no AI Spines/backs (Books without art get Regal's drawn ones)
//   --no-model          no Gemini text model either: blurbs cut by rules, no quotes
//   --now               AI right away at full price instead of the Batch API
//   --wait <min>        minutes to wait for a new batch job (default 30; 0 = submit and exit)
//   --force             rebuild every selected Book even if nothing changed
//   --revalidate        ask the server whether input images changed (conditional GET)
//   --publish <prefix>  upload what changed to the R2 bucket under <prefix>/ (e.g. v2)
//   --bucket <name>     R2 bucket (default $REGAL_R2_BUCKET, else portfolio-books)
//   --dry-run           nothing remote and nothing paid: no upload, no Gemini call (the AI
//                       cost is printed); the free work runs and the local output is written
//
// Relative paths are taken from where the command was started (pnpm's INIT_CWD).
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { resolvePublisher, resolveQuotes } from './assets/backText'
import { resolveBlurb } from './assets/blurb'
import { findApple, resolveFront } from './assets/front'
import { getImageBatch, submitImageBatch } from './assets/gemini'
import { generateJacket, jacketRequest } from './assets/jacket'
import { parseLimit } from './assets/select'
import type { Tools } from './enrich'
import { DEFAULT_BUCKET, wranglerUploader } from './publish'
import { resolveDescription } from './resolvers/descriptions'
import { InvalidInputError, runAssets } from './run'
import { isHttpUrl } from './util'

const PIPELINE = resolve(import.meta.dirname, '..')
const ROOT = resolve(PIPELINE, '..')
const CWD = process.env.INIT_CWD ?? process.cwd()

const { values: args } = parseArgs({
  options: {
    'in': { type: 'string' },
    'out': { type: 'string' },
    'cache': { type: 'string' },
    'photos': { type: 'string' },
    'limit': { type: 'string', default: 'all' },
    'no-ai': { type: 'boolean', default: false },
    'no-model': { type: 'boolean', default: false },
    'now': { type: 'boolean', default: false },
    'wait': { type: 'string', default: '30' },
    'force': { type: 'boolean', default: false },
    'revalidate': { type: 'boolean', default: false },
    'publish': { type: 'string' },
    'bucket': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'concurrency': { type: 'string', default: '4' },
  },
})

/** The real lookups: Apple, the German National Library, Google, Open Library; Gemini's text model when allowed. */
function lookupTools(model: boolean): Tools {
  return {
    resolveFront: (book, options) => resolveFront(book, options),
    findApple: (book, options) => findApple(book, options),
    resolveBlurb: (apple, library, useModel) => resolveBlurb(apple, library, model && useModel),
    resolveDescription: async book => (await resolveDescription(
      { isbn13: book.isbn13, isbn10: book.isbn10, title: book.title, author: book.author },
      { fetch, googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY },
    ))?.description ?? null,
    resolvePublisher: isbn13 => resolvePublisher(null, isbn13),
    resolveQuotes: description => (model ? resolveQuotes(description) : Promise.resolve([])),
  }
}

async function main() {
  if (!args.in) {
    console.error('Usage: pnpm --dir pipeline assets --in <file|url> [--out <dir>] [--limit <n|all>] [--no-ai] [--no-model] [--dry-run] [--publish v2] …')
    process.exit(2)
  }
  const dryRun = args['dry-run']!
  const model = !args['no-model'] && !dryRun
  const cacheDir = resolve(CWD, args.cache ?? join(ROOT, '.data/regal-assets'))
  const bucket = args.bucket ?? process.env.REGAL_R2_BUCKET ?? DEFAULT_BUCKET
  const result = await runAssets({
    input: isHttpUrl(args.in) ? args.in : resolve(CWD, args.in),
    out: resolve(CWD, args.out ?? join(ROOT, '.data/regal-assets/out')),
    cacheDir,
    photos: resolve(CWD, args.photos ?? join(cacheDir, 'photos')),
    limit: parseLimit(args.limit),
    ai: !args['no-ai'],
    model,
    now: args.now!,
    wait: Number(args.wait) || 0,
    force: args.force!,
    revalidate: args.revalidate!,
    publish: args.publish ?? null,
    bucket,
    dryRun,
    concurrency: Number(args.concurrency) || 4,
  }, {
    tools: lookupTools(model),
    aiTools: { jacketRequest, generateJacket, submitImageBatch, getImageBatch },
    uploader: wranglerUploader(bucket, PIPELINE),
    log: line => console.log(line),
    warn: line => console.warn(line),
  })
  if (result.failed) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error instanceof Error && !(error instanceof InvalidInputError) ? error.stack ?? error.message : error instanceof Error ? error.message : error)
  process.exit(1)
})
