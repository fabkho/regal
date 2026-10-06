# Producing and publishing a library file

Regal shows one file, the [Regal library file](library-file.md). This page is about making one and putting it online. Three steps, each with one job:

```
producer (Libellus · library:convert · by hand) ──► library file ──► Regal assets (optional) ──► library file + images ──► any static host ──► Regal
```

1. **Produce.** Something writes a library file with the reading data: [Libellus](#from-libellus), [old published data](#from-old-published-data-the-goodreads-bridge), or [you, by hand](#by-hand). Where the data comes from is the producer's business, not Regal's.
2. **Enrich: Regal assets** ([`pipeline/`](../pipeline/README.md), optional). Takes any library file and returns it with each Book's `assets` (front, Spine, back, pile copies, palette, Spine colour, photo faces, source) and the images, plus a blurb for Books without one. Without it Regal draws what's missing.
3. **Publish.** Put the file and its images on [any static host](#publishing) and point `librarySrc` at it.

## From Libellus

[Libellus](https://github.com/fabkho/libellus) writes the owner's shelf: `pnpm export:regal` there by hand (`--statuses read`, `--carry-art` to keep the art already published), or its `regal-export` edge function, which [the daily chain](#the-daily-chain) fetches. Field mapping: [For producers](library-file.md#for-producers).

## From old published data (the Goodreads bridge)

`pnpm library:convert` turns data published before Libellus, a reading-tracker/Goodreads-derived v1 `library.json` (`{ books: [...] }`) plus its `manifest.json`, into a library file. It's a bridge, not part of the daily job: [Converting old published data](library-file.md#converting-old-published-data). Regal itself no longer reads a Goodreads CSV export: import the export into Libellus (it reads Goodreads, Fable and reading-tracker exports) and export a library file from there. Real exports never go in this repository (`pnpm check:privacy` fails on them).

## By hand

A library file is plain JSON; the [format](library-file.md) lists every field. The smallest useful one:

```json
{
  "version": 2,
  "generatedAt": "2026-05-01T06:00:00Z",
  "owner": "Ada",
  "books": [
    { "id": "1", "title": "Frankenstein", "authors": ["Mary Shelley"], "pages": 280, "status": "read", "dateRead": "2026-03-14", "rating": 4.5 }
  ]
}
```

Check it before you publish:

- Drop it on the [playground](https://fabkho.github.io/regal/playground) (Library file → Your file): it validates in the browser and shows the first problems, or the shelf.
- Or in a checkout: `pnpm exec tsx -e "import { readFileSync } from 'node:fs'; import { parseLibraryFile, formatLibraryFileErrors } from './shared/library/libraryFile.ts'; const r = parseLibraryFile(readFileSync(process.argv[1], 'utf8')); console.log(r.ok ? 'valid: ' + r.library.books.length + ' Books' : formatLibraryFileErrors(r.errors).join('\n'))" my-library.json`, which prints `valid: 1 Books` or lines like `books[0].rating: must be quarter stars from 0 to 5 (0, 0.25 … 5) or null, got 7`.

Without `assets`, every Book is drawn: Spines typeset from title and author, backs from the blurb, a plain front. Add `assets.front` (a cover URL) per Book, or run the file through Regal assets.

## Publishing

The file and its images are static: any host that serves files works, the host app's own `public/` included.

- **Same origin** (`public/books/library.json`, `librarySrc: '/books/library.json'`): nothing else to set up.
- **Another origin** (a CDN, a bucket, GitHub Pages): it must send CORS headers for every origin that shows the shelf, for the file and for every image ([CORS for the image host](nuxt-layer.md#cors-for-the-image-host)).
- Image references are relative to the file (Regal assets writes `<key>/front.webp` next to `library.json`), so upload the output folder as it is.
- **Cloudflare R2**: `pnpm regal-assets … --publish <prefix>` uploads what changed (below); the owner's shelf lives under `v2/` of the bucket `portfolio-books`, served at `books.fabkho.dev`.

Covers that Regal assets finds (Apple Books, Google Books, Open Library, the German National Library) and the blurbs it copies belong to their publishers. Publish them only where you may, and never commit them to a repository: `.data/` is gitignored and `pnpm check:privacy` fails on `public/book-assets/` and `.data/`.

## Running Regal assets

`pipeline/` is its own package (own `package.json` and lockfile, never installed by a host that extends the layer):

```bash
pnpm --dir pipeline install
pnpm regal-assets --in .data/library-v2.json --dry-run --no-ai   # = pnpm --dir pipeline assets …
```

- `--in <file|url>`: the library file, validated with the shared validator (invalid: the errors, nothing written). `--out <dir>` (default `.data/regal-assets/out`): `library.json` plus `<key>/{front,spine,back,front-pile,spine-pile}.webp`, `<key>` the ISBN-13 or the Book id; image references in the output are relative to it.
- Per Book: what the file brings and is good enough stays (copied into the output, so the published set doesn't depend on where the input's images live); a front below 800 px or none goes through today's front chain (Apple, the German National Library for German editions, Google, the file's own front, Open Library), the taller one wins; photo drop-ins (`<cache>/photos/<key>/front.jpg` …) beat everything; pile copies, palette and Spine colour are made from the faces; a Book without a blurb gets one (Apple's publisher copy, else Open Library/Google).
- AI Spines/backs (Gemini, `GEMINI_API_KEY` with billing) for Books with a front and no Spine/back art, through the Batch API (half price; `--now` for direct calls). A paid jacket is kept in the cache and never bought twice. `--no-ai` leaves them to Regal's drawn ones, `--no-model` skips the text model too.
- Incremental and idempotent: a Book is rebuilt only when what its assets are made of changed (its sizing and text fields, its input images' content, its photos); a run without changes rewrites nothing, not even `generatedAt`. Downloads, jackets, open batch jobs and the state live under `.data/regal-assets/` (`--cache`). `--revalidate` asks the servers whether input images changed behind the same URL; `--force` rebuilds anyway; `--limit <n>` takes only the n most recently read Books this run.
- `--publish v2` uploads what changed to the R2 bucket (`$REGAL_R2_BUCKET`, default `portfolio-books`; `wrangler login` once, or `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment as in the workflow) under `v2/`: images first, `library.json` last, files that are gone deleted. Only that prefix is ever written; the bucket root (the old v1 files) never, and an empty prefix is refused.
- `--dry-run`: nothing remote and nothing paid. No upload (the plan is printed), no Gemini call (the AI cost is printed, as today's build did); the free work runs and the local output is written, so the dry run shows the enriched file.

Books without a blurb now get theirs from Regal assets: the display has no description resolver any more, so a file that skips this step shows them without one.

**CORS.** The portfolio loads the images cross-origin as WebGL textures, so the bucket's domain (`books.fabkho.dev`) must answer with CORS headers for the page's origin (`https://fabkho.dev`, and any preview/dev origin that shows `/books`), for `v2/` as for the old v1 files.

## The daily chain

The shelf is published from the cloud ([libellus#110](https://github.com/fabkho/libellus/issues/110)) by the workflow [`publish-shelf.yml`](../.github/workflows/publish-shelf.yml): [Libellus](https://github.com/fabkho/libellus) (hosted Supabase) serves the owner's library file from its `regal-export` edge function, and the workflow enriches and publishes it under `v2/`:

```
Libellus change ─► DB trigger (owner only, ≥ 10 min apart) ─► repository_dispatch libellus-changed ─┐
daily 05:00 UTC (schedule) ─────────────────────────────────────────────────────────────────────────┼─► publish-shelf
by hand (workflow_dispatch, dry_run / allow_shrink) ────────────────────────────────────────────────┘
publish-shelf: GET regal-export ─► validate ─► pnpm regal-assets --no-ai --no-model --revalidate --publish v2 ─► R2 portfolio-books/v2/
```

1. **Export.** `curl -H "Authorization: Bearer $REGAL_EXPORT_TOKEN" "$LIBELLUS_EXPORT_URL"`: the owner's Books read as a library file, with each Book's published art carried over (Libellus reads `books.fabkho.dev/v2/library.json` and keeps every matched Book's front, Spine and back, by ISBN-13, else by title plus the first author's surname), the member's own page count where she set one. The same file `pnpm export:regal --statuses read --carry-art …` writes in Libellus. When Libellus cannot read the published file it answers 502 and nothing is published, so the art is never dropped.
2. **Validate.** Regal's validator (`pipeline/src/layer.ts`), and a guard: an export with far fewer Books than the shelf shows now (more than 5 and 10 % fewer: a wrong owner, a broken read) is not published unless a manual run sets `allow_shrink`.
3. **Enrich and publish.** `pnpm regal-assets --in <file> --no-ai --no-model --revalidate --publish v2` with wrangler on an API token. `.data/regal-assets` (downloads, output, the state of the last publish) is kept in the Actions cache between runs, so a quiet run rebuilds and uploads nothing. A run with an empty cache (the first one, or after GitHub evicted it) rebuilds every Book and uploads every file once.

The job summary lists the export's and the published shelf's Book counts, what Regal assets wrote, what it published (or would have) and the Books it rebuilt. Runs never overlap: one waits for the other, and of the waiting ones only the latest runs. A step that fails fails the run (GitHub mails the owner).

A dry run: **Actions → publish-shelf → Run workflow → dry_run**: everything but the upload (`--dry-run`: the plan is printed). Locally, the same as the workflow, never `--publish` while testing:

```bash
curl -fsS -H "Authorization: Bearer $REGAL_EXPORT_TOKEN" "$LIBELLUS_EXPORT_URL" -o .data/library.json
pnpm regal-assets --in .data/library.json --no-ai --no-model --revalidate --dry-run --publish v2
```

Secrets (Settings → Secrets and variables → Actions; never in the repo):

| Secret | |
|---|---|
| `REGAL_EXPORT_TOKEN` | The shared bearer secret, the same value as the `regal-export` function secret in Libellus. |
| `LIBELLUS_EXPORT_URL` | `https://<project>.supabase.co/functions/v1/regal-export`. |
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token with R2 Object Read & Write on the bucket `portfolio-books` only. |
| `CLOUDFLARE_ACCOUNT_ID` | The account that holds the bucket. |

Optional variables: `REGAL_R2_BUCKET` (default `portfolio-books`), `REGAL_PUBLISHED_URL` (the shelf the shrink guard compares with, default `https://books.fabkho.dev/v2/library.json`). The portfolio reads `books.fabkho.dev/v2/library.json` ([#41](https://github.com/fabkho/regal/issues/41)). This replaces the owner's daily job on his Mac (Libellus `pnpm export:regal`, then `regal-assets` in a local checkout), which is retired once the workflow has run green twice. The old reading-tracker build (`books:daily`) and the `library:convert` step are retired; retiring the v1 R2 data is [#48](https://github.com/fabkho/regal/issues/48).
