# Regal

*Regal* is German for shelf.

A reading library as a 3D bookcase. Pull a book off the shelf, turn it around, see what you thought of it.

Regal is only the display: it renders one input, the [Regal library file](docs/library-file.md). Where the reading data comes from (a reading tracker, Goodreads, [Libellus](https://github.com/fabkho/libellus)) is the business of whatever writes that file, a **Pipeline**.

Built with Nuxt 4 and [TresJS](https://tresjs.org) (three.js for Vue).

## What it does

- Point it at a Regal library file (the site shows a demo; `?src=<url>` any other) and its Books stand on an antique Bookcase — sized by page count and binding, grouped by Reading status.
- Covers, Spines and backs come with the file. What it lacks is drawn: a placeholder front, the colour sampled from the front's left edge, title and author typeset along the Spine, the blurb and ISBN barcode on the back.
- Hover a Book: it eases forward and catches the light. Click: it comes out to you showing its Cover; click again for the back, again to put it away. Drag to spin it.
- **Stack** view: the whole Library as one pile you scroll through smoothly (wheel, drag, arrow keys; on touch a flicked finger glides on). Books passing the middle of the view fan out like pages flipped through, the centred one most, with its title and stars beside it (a caption on narrow screens): the hover for scrolling and phones.

![bookcase](docs/assets/pick-bookcase.png)

Spec and roadmap: [#1](https://github.com/fabkho/regal/issues/1).

## Development

```bash
pnpm install
pnpm dev          # http://localhost:3000 — the demo library file; /?src=<url> views another
pnpm test         # unit + nuxt + browser e2e
pnpm lint
```

The site is a viewer: it shows `librarySrc` (default: the synthetic demo library, `demo/demo-library.json`, served at `/demo-library.json`; `NUXT_PUBLIC_REGAL_LIBRARY_SRC` points it elsewhere) and `?src=<url>` views any library file. A `?src=` file is loaded by the browser only, never through the server, so it must allow cross-origin requests from the site.

Daily publishing: `pnpm books:daily` rebuilds the asset set from the reading tracker (no AI) and uploads what changed to an R2 bucket (`$REGAL_R2_BUCKET`, default `portfolio-books`, via `wrangler login`). It fingerprints its input (the Read shelf without `updatedAt`/`averageRating`/`notePath`, the overrides, the Goodreads exports, cover picks and the pipeline code) and returns right away when nothing changed; uploads only files whose content changed and leaves private fields out of `library.json`. `--dry-run` reports, `--force` rebuilds anyway. Run it from a scheduler after the tracker sync.

Clicking in the 3D has a fuzz test: with the app running, `node scripts/pick-fuzz.mjs --url http://localhost:3000 --seeds 1,2,3 --steps 200` drives random clicks, drags, scrolls, re-sorts and Escapes in a headless browser and checks the Pick after each one (it loads `/?view=stack&debug=pick`; `--view bookcase`, `--src <url>` for another library file, e.g. your own converted one).

## Use Regal as a Nuxt layer

Regal is also a [Nuxt layer](https://nuxt.com/docs/guide/going-further/layers): another Nuxt 4 app can extend it and show a Library on one of its own pages (the portfolio's `/books`). The host gets two components and their composables, nothing else: no Regal page, no server routes, no global CSS, no page title, no dev panel, no demo data.

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
        librarySrc: '/books/library.json',
      },
    },
  },
})
```

### Config: `runtimeConfig.public.regal`

| Key | Default | Meaning |
|---|---|---|
| `librarySrc` | `''` | URL of the [Regal library file](docs/library-file.md) to show: absolute, or relative to the page (`/books/library.json` from the host's `public/`). Unset: the components show an error saying so. |

Env override as usual: `NUXT_PUBLIC_REGAL_LIBRARY_SRC=…`.

**Changed with the library file** ([#39](https://github.com/fabkho/regal/issues/39)): `mode` and `assetsBase` are gone. There is one way to get a Library (the file at `librarySrc`, its images listed in it), so a host that still sets them gets no error, they are ignored; drop them when you switch. `librarySrc` now names a library file, not a reading-tracker export (convert one with `pnpm library:convert`, below); such an export shows the error card. The Cover and description resolvers (`/api/cover`, `/api/description`, `NUXT_GOOGLE_BOOKS_API_KEY`) are no longer part of the layer.

### Components

```vue
<!-- body -->
<RegalBooksStage class="books-stage" />
<!-- the host's sidebar -->
<RegalBooksSidebar heading="Bookshelf" count-label="Books read" />
```

- **`RegalBooksStage`**: the 3D Stack only (no Bookcase/Stack switch), the picked Book's details card over it. Give it a height (it fills its box; `min-height: 24rem`). Prop `controls` (default `false`) adds the sort & filter chips over the 3D.
- **`RegalBooksSidebar`**: the count of read Books, the Stack's sort/year/rating filters and the Books as records (hover lifts the Book in the 3D, click takes it out). Props: `heading` (`'Bookshelf'`, `''` hides it), `countLabel` (`'Books read'`), `filters` (`true`), `list` (`true`). Fills the height it gets; the records scroll.

Both load the Library from `librarySrc` themselves (server-side when possible, so the records are in the HTML; one fetch) and share it, the Stack's sort & filters (kept in the URL: `?sort=rating&year=2025&min=4`; `group=year|month|off` sets the date separators, default by year), the picked Book and the hovered one. They work on the same page in any layout, also when one sits in a layout and the other in the page.

The look is the decided one: re-sorts move by hand when up to 3 Books move, as a carousel above that; Books a filter brings back pop in scattered around the pile and leaving ones slide out and shrink away, and when no Book stays (a new year) the old pile sweeps out to the left before the new one settles in from the bottom up (instant with reduced motion); classic back covers; title and stars in the hover label; while you scroll the Stack (and on touch screens), Books passing the middle of the view riffle out, the centred one with that label.

**Styling.** The components use the paper-ink tokens with fallbacks, e.g. `var(--color-ink, #2C2C2A)`, so they look right with or without them. A host that defines the same tokens (`--color-bg`, `--color-ink`, `--color-ink-muted`, `--color-ink-faint`, `--color-line`, `--color-accent`, `--color-accent-tint`, `--font-mono`, `--font-serif`, `--text-2xs` … `--text-2xl`) restyles them; set them on a wrapper to change only Regal. Regal registers the IBM Plex Mono, Patua One and Antonio `@font-face`s (no other global CSS).

Regal's composables (`useLibrary`, `useBookPick`, `useStackView`, `useRegalConfig` …) are auto-imported into the host too; avoid those names in the host.

### Static data

Regal reads one file: the [Regal library file](docs/library-file.md) (`version: 2`), every Book with its data and resolved assets (front, Spine and back images, small pile copies, Spine colours, blurb), validated when it loads. Put it anywhere (the host's `public/`, a CDN) and point `librarySrc` at it.

- Image references in it are absolute or relative to the file's own URL (`9780756413026/front.webp` next to the file). Images on another origin must allow CORS, as they become WebGL textures.
- A Book without an image gets the drawn one: a placeholder front, a typeset Spine and back.
- A file that doesn't load or isn't valid (another `version`, a reading-tracker export, a broken field) shows an error card with the first problems (`books[3].rating: must be …`), never an empty shelf.
- The Stack loads lazily from the file's `pile` copies: the Spines in and around the view first, then the rest of the pile in the background, and a Book's full front and back only once it is pointed at or taken out. Without `pile` copies the full faces stand in; without `palette` the Spine colours are sampled from the front in the browser.

**Producing the file (Pipeline, until Libellus writes it).** Today's build makes the asset set and `pnpm library:convert` turns it into the library file ([Converting](docs/library-file.md#converting-todays-data)): `pnpm assets:build` writes `public/book-assets/` (`library.json`, `manifest.json` and `<key>/{front,spine,back,front-pile,spine-pile}.webp`); `pnpm assets:build --limit all --no-ai --no-model` covers the whole Read shelf (undated Books last) with free fronts and generated Spines/backs, no Gemini call; `--pile-only` (re)makes just the small copies and colours. Then `pnpm library:convert --library public/book-assets/library.json --manifest public/book-assets/manifest.json --out <host>/public/books/library.json --assets-base <where the images are served>`.

**Correcting the reading history.** The tracker (Fable) keeps one entry per edition, has gaps and wrong dates. A private overrides file, `~/.reading-tracker/regal-overrides.json` (or `--overrides <file>`, `REGAL_OVERRIDES`; never commit it), fixes that before anything is built ([example](docs/overrides.example.json)):

- `goodreads`: Goodreads Library exports, most trusted first. Their read rows are matched to tracker Books (ISBN, title + author, typos, series number, `goodreads` aliases); for a matched Book the most trusted export's read date wins, and its edition in the read language becomes the Book's (ISBN, cover; the title too when the language changes). Goodreads reads the tracker doesn't have are only reported.
- `books`: per tracker id (or an 8+ character id prefix): `skip`, `mergeInto` (same work, its rating/review fill gaps), `dateRead`, `dateStarted`, `isbn13`, `title`, `author`, `lang` (`en` default, `de`: German store and German National Library covers), `coverUrl` (used as the front), `goodreads` (aliases), `note`.

Same-title-same-author editions are merged automatically (the dated one stays). The build prints what changed (dropped duplicates, date and edition changes, unmatched rows both ways, series read out of order) and keeps it in `corrections.json` next to the manifest. A Book whose key changed keeps its blurb; with `--limit all`, asset sets of keys no longer used move to `.data/book-assets-stale/`. `--retry-fronts` looks again for fronts below 800 px.

`nuxt dev` note: a `public/books/` folder next to a `/books` page makes the dev server redirect `/books` to `/books/` (the page still renders). Production builds don't.

`tests/fixtures/layer-host/` is a minimal host (a synthetic library file) built by `tests/e2e/layer-host.test.ts`; `pnpm nuxi dev tests/fixtures/layer-host` runs it.
