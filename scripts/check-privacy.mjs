#!/usr/bin/env node
// Privacy guard: fails when the repo tracks (or a commit would add) personal
// reading data or publisher-derived images outside the places meant for them.
// The global gitleaks hooks only look for secrets, not for these.
//
//   node scripts/check-privacy.mjs           # every tracked file (CI)
//   node scripts/check-privacy.mjs --staged  # only files a commit would add
import { execFileSync } from 'node:child_process'

const staged = process.argv.includes('--staged')
const files = execFileSync('git', staged
  ? ['diff', '--cached', '--name-only', '--diff-filter=ACR', '-z']
  : ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)

/** Never in the repo, wherever they are. */
const FORBIDDEN = [
  [/(^|\/)goodreads_library_export[^/]*$/i, 'a real Goodreads export'],
  [/^public\/book-assets\//, 'a built Book asset set (publisher covers, personal data)'],
  [/(^|\/)\.data\//, 'local data (downloads, enriched output, state)'],
  [/\.(db|sqlite3?)$/i, 'a database (e.g. the reading tracker\'s library.db)'],
  [/(^|\/)\.env(\.|$)(?!example$)/, 'an env file'],
]

/** Allowed only below these folders (synthetic fixtures, docs, bundled art). */
const CONTAINED = [
  [/\.csv$/i, ['tests/fixtures/', 'app/assets/data/'], 'CSV'],
  // demo/covers/: the showcase shelf's synthetic fronts (scripts/showcase/covers.mjs), never publisher art.
  [/\.(png|jpe?g|webp|avif|gif)$/i, ['docs/assets/', 'tests/fixtures/', 'public/models/', 'assets-src/', 'demo/covers/'], 'image'],
  [/(^|\/)library\.json$/i, ['tests/fixtures/'], 'Library export'],
]

const problems = []
for (const file of files) {
  for (const [pattern, what] of FORBIDDEN) {
    if (pattern.test(file)) problems.push(`${file}: ${what}`)
  }
  for (const [pattern, folders, what] of CONTAINED) {
    if (pattern.test(file) && !folders.some(folder => file.startsWith(folder))) {
      problems.push(`${file}: ${what} outside ${folders.join(', ')}`)
    }
  }
}

if (problems.length) {
  console.error(`Privacy check failed (${staged ? 'staged files' : 'tracked files'}):`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('Real exports and book assets stay local (see AGENTS.md). Fixtures must be synthetic.')
  process.exit(1)
}
console.log(`Privacy check passed (${files.length} ${staged ? 'staged' : 'tracked'} files).`)
