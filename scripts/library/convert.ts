// Today's published data → a Regal library file (docs/library-file.md).
//
//   pnpm library:convert --library <url|path> --manifest <url|path> --out <file>
//     [--assets-base <url|path>] [--owner <name>] [--generated-at <iso>]
//
// --library      reading-tracker JSON (`{ books: [...] }`, the published library.json)
// --manifest     the asset manifest.json (optional: without it no Book has assets)
// --assets-base  where the manifest's paths live; default: the manifest's folder
//                (its URL, or its path relative to --out)
// --out          the library file to write; it's validated first and not
//                written when invalid. Real data goes to .data/ (gitignored).
//
// Only reads its inputs (http GET or local files).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { formatLibraryFileErrors, validateLibraryFile } from '../../shared/library/libraryFile'
import { convertPublished } from './fromPublished'
import type { Manifest } from './fromPublished'

const { values: args } = parseArgs({
  options: {
    'library': { type: 'string' },
    'manifest': { type: 'string' },
    'assets-base': { type: 'string' },
    'out': { type: 'string' },
    'owner': { type: 'string' },
    'generated-at': { type: 'string' },
  },
})

const isUrl = (source: string) => /^https?:\/\//i.test(source)

async function read(source: string): Promise<string> {
  if (!isUrl(source)) return readFileSync(resolve(source), 'utf8')
  const response = await fetch(source, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`)
  return response.text()
}

/** The manifest's folder, as the default assets base. */
function defaultAssetsBase(manifest: string, out: string): string {
  if (isUrl(manifest)) return new URL('.', manifest).href
  const path = relative(dirname(resolve(out)), dirname(resolve(manifest))).split(sep).join('/')
  return path ? `${path}/` : ''
}

async function main() {
  if (!args.library || !args.out) {
    console.error('Usage: pnpm library:convert --library <url|path> [--manifest <url|path>] [--assets-base <url|path>] --out <file> [--owner <name>]')
    process.exit(2)
  }
  const [libraryText, manifestText] = await Promise.all([read(args.library), args.manifest ? read(args.manifest) : null])
  const manifest = manifestText ? JSON.parse(manifestText) as Manifest : null
  const assetsBase = args['assets-base'] ?? (args.manifest ? defaultAssetsBase(args.manifest, args.out) : undefined)

  const { library, warnings, stats } = convertPublished({
    libraryText,
    manifest,
    assetsBase: assetsBase || undefined,
    generatedAt: args['generated-at'] ?? new Date().toISOString(),
    owner: args.owner,
  })
  for (const warning of warnings) console.warn(`warning: ${warning}`)

  const result = validateLibraryFile(library)
  if (!result.ok) {
    console.error(`The converted file is invalid (${result.errors.length} error(s)); nothing written:`)
    for (const line of formatLibraryFileErrors(result.errors)) console.error(`  ${line}`)
    process.exit(1)
  }

  const out = resolve(args.out)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, `${JSON.stringify(library, null, 2)}\n`)
  console.log(`Wrote ${relative(process.cwd(), out) || out}: valid Regal library file (version ${library.version}).`)
  console.log(`  ${stats.books} Books, ${stats.withAssets} with assets (front ${stats.withFront}, Spine ${stats.withSpine}, back ${stats.withBack}, pile ${stats.withPile}, palette ${stats.withPalette})`)
  if (stats.coverFallbacks) console.log(`  ${stats.coverFallbacks} front(s) from the tracker's coverUrl (no asset front)`)
  if (stats.unusedManifestEntries) console.log(`  ${stats.unusedManifestEntries} manifest entr${stats.unusedManifestEntries === 1 ? 'y' : 'ies'} no Book uses`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
