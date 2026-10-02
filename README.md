# Regal

*Regal* is German for shelf.

Upload your Goodreads library export and browse it as a 3D bookcase. Pull a book off the shelf, turn it around, see what you thought of it.

Built with Nuxt 4 and [TresJS](https://tresjs.org) (three.js for Vue).

## What it does

- Drop your Goodreads export (or try the demo) and your Books stand on an antique Bookcase — sized by page count and binding, grouped by Reading status.
- Real Covers, found by ISBN (Open Library; Google Books with a key). Spines and backs are generated from each Cover: colour from its left edge, title and author typeset along the Spine, the real blurb and ISBN barcode on the back.
- Hover a Book: it eases forward and catches the light. Click: it comes out to you showing its Cover; click again for the back, again to put it away. Drag to spin it.
- **Stack** view: the whole Library as one pile you scroll through smoothly (wheel, drag, arrow keys; on touch a flicked finger glides on). Books passing the middle of the view fan out like pages flipped through, the centred one most, with its title and stars beside it (a caption on narrow screens): the hover for scrolling and phones.

![bookcase](docs/assets/pick-bookcase.png)

Spec and roadmap: [#1](https://github.com/fabkho/regal/issues/1).

## Development

```bash
pnpm install
pnpm dev          # http://localhost:3000 — dev adds a "Sun Eater (dev)" test Library
pnpm test         # unit + nuxt + browser e2e
pnpm lint
```

Optional: `NUXT_GOOGLE_BOOKS_API_KEY` enables Google Books as a Cover source.

Clicking in the 3D has a fuzz test: with the app running, `node scripts/pick-fuzz.mjs --url http://localhost:3000 --seeds 1,2,3 --steps 200` drives random clicks, drags, scrolls, re-sorts and Escapes in a headless browser and checks the Pick after each one (it loads `/?view=stack&debug=pick`; `--view bookcase`, `--data latest` for your own Library on the dev server).

## Getting your Goodreads export

Goodreads → My Books → Import and export → **Export Library**. You get `goodreads_library_export.csv`. The file is parsed in your browser; only ISBN, title and author are sent to the server to look up covers.

## Use Regal as a Nuxt layer

Regal is also a [Nuxt layer](https://nuxt.com/docs/guide/going-further/layers): another Nuxt 4 app can extend it and show a Library on one of its own pages (the portfolio's `/books`). The host gets two components and nothing else: no Regal page, no global CSS, no page title, no dev panel or dev API.

### Extend it

```ts
// nuxt.config.ts of the host app
export default defineNuxtConfig({
  // Deploys: from GitHub (the layer's dependencies are installed with it).
  // Pin a branch or tag with a ref: 'github:fabkho/regal#main'.
  extends: [['github:fabkho/regal', { install: true }]],
  // Local development against a checkout: extends: ['../regal/'] (trailing slash).

  runtimeConfig: {
    public: {
      regal: {
        mode: 'embed',
        librarySrc: '/books/library.json',
        assetsBase: '/books/',
      },
    },
  },
})
```

### Config: `runtimeConfig.public.regal`

| Key | Default | Meaning |
|---|---|---|
| `mode` | `'app'` | `'app'`: Regal's standalone site (upload, demo, localStorage). `'embed'`: the Library comes from `librarySrc`; no upload UI, nothing read from or written to localStorage. |
| `librarySrc` | `''` | `embed`: URL of a reading-tracker export (see below), usually a static file in the host's `public/`. |
| `assetsBase` | `'/book-assets/'` | Folder (URL) of the Book asset set: `manifest.json` and the images it lists. |

Env overrides work as usual: `NUXT_PUBLIC_REGAL_MODE=embed`, `NUXT_PUBLIC_REGAL_LIBRARY_SRC=…`, `NUXT_PUBLIC_REGAL_ASSETS_BASE=…`. Optional server key: `NUXT_GOOGLE_BOOKS_API_KEY` (Cover resolver).

### Components

```vue
<!-- body -->
<RegalBooksStage class="books-stage" />
<!-- the host's sidebar -->
<RegalBooksSidebar heading="Bookshelf" count-label="Books read" />
```

- **`RegalBooksStage`**: the 3D Stack only (no Bookcase/Stack switch), the picked Book's details card over it. Give it a height (it fills its box; `min-height: 24rem`). Prop `controls` (default `false`) adds the sort & filter chips over the 3D.
- **`RegalBooksSidebar`**: the count of read Books, the Stack's sort/year/rating filters and the Books as records (hover lifts the Book in the 3D, click takes it out). Props: `heading` (`'Bookshelf'`, `''` hides it), `countLabel` (`'Books read'`), `filters` (`true`), `list` (`true`). Fills the height it gets; the records scroll.

Both load the Library from `librarySrc` themselves (server-side when possible, so the records are in the HTML) and share it, the Stack's sort & filters (kept in the URL: `?sort=rating&year=2025&min=4`; `group=year|month|off` sets the date separators, default by year), the picked Book and the hovered one. They work on the same page in any layout, also when one sits in a layout and the other in the page.

The look is the decided one: re-sorts move by hand when up to 3 Books move, as a carousel above that; Books a filter brings back pop in scattered around the pile and leaving ones slide out and shrink away, and when no Book stays (a new year) the old pile sweeps out to the left before the new one settles in from the bottom up (instant with reduced motion); classic back covers; title and stars in the hover label; while you scroll the Stack (and on touch screens), Books passing the middle of the view riffle out, the centred one with that label.

**Styling.** The components use the paper-ink tokens with fallbacks, e.g. `var(--color-ink, #2C2C2A)`, so they look right with or without them. A host that defines the same tokens (`--color-bg`, `--color-ink`, `--color-ink-muted`, `--color-ink-faint`, `--color-line`, `--color-accent`, `--color-accent-tint`, `--font-mono`, `--font-serif`, `--text-2xs` … `--text-2xl`) restyles them; set them on a wrapper to change only Regal. Regal registers the IBM Plex Mono, Patua One and Antonio `@font-face`s (no other global CSS).

Regal's composables (`useLibrary`, `useBookPick`, `useStackView`, `useRegalConfig` …) are auto-imported into the host too; avoid those names in the host.

### Static data

Put both under the host's `public/` (any path; point `librarySrc` and `assetsBase` at them):

- `library.json`: the reading-tracker CLI's `reading list --json` output (`{ "books": [...] }`). A Goodreads CSV export works as well.
- `manifest.json` under `assetsBase`: Book key (ISBN-13, else the Book id) → `{ "front": "<key>/front.webp", "spine": "<key>/spine.webp", "back": "<key>/back.webp", ... }`, paths relative to `assetsBase`; the images next to it as `<key>/{front,spine,back}.webp`. `pnpm assets:build` writes exactly this to `public/book-assets/` (copy it over); `pnpm assets:build --limit all --no-ai --no-model` covers the whole Read shelf (undated Books last) with free fronts and generated Spines/backs, no Gemini call. Books without an entry get a Cover from the Cover resolver (`/api/cover`, part of the layer) and drawn Spines/backs.

**Correcting the reading history.** The tracker (Fable) keeps one entry per edition, has gaps and wrong dates. A private overrides file, `~/.reading-tracker/regal-overrides.json` (or `--overrides <file>`, `REGAL_OVERRIDES`; never commit it), fixes that before anything is built ([example](docs/overrides.example.json)):

- `goodreads`: Goodreads Library exports, most trusted first. Their read rows are matched to tracker Books (ISBN, title + author, typos, series number, `goodreads` aliases); for a matched Book the most trusted export's read date wins, and its edition in the read language becomes the Book's (ISBN, cover; the title too when the language changes). Goodreads reads the tracker doesn't have are only reported.
- `books`: per tracker id (or an 8+ character id prefix): `skip`, `mergeInto` (same work, its rating/review fill gaps), `dateRead`, `dateStarted`, `isbn13`, `title`, `author`, `lang` (`en` default, `de`: German store and German National Library covers), `coverUrl` (used as the front), `goodreads` (aliases), `note`.

Same-title-same-author editions are merged automatically (the dated one stays). The build prints what changed (dropped duplicates, date and edition changes, unmatched rows both ways, series read out of order) and keeps it in `corrections.json` next to the manifest. A Book whose key changed keeps its blurb; with `--limit all`, asset sets of keys no longer used move to `.data/book-assets-stale/`. `--retry-fronts` looks again for fronts below 800 px.

`nuxt dev` note: a `public/books/` folder next to a `/books` page makes the dev server redirect `/books` to `/books/` (the page still renders). Production builds don't.

`tests/fixtures/layer-host/` is a minimal host (synthetic data) built by `tests/e2e/layer-host.test.ts`; `pnpm nuxi dev tests/fixtures/layer-host` runs it.
