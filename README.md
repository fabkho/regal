# Regal

*Regal* is German for shelf.

Upload your Goodreads library export and browse it as a 3D bookcase. Pull a book off the shelf, turn it around, see what you thought of it.

Built with Nuxt 4 and [TresJS](https://tresjs.org) (three.js for Vue).

## What it does

- Drop your Goodreads export (or try the demo) and your Books stand on an antique Bookcase — sized by page count and binding, grouped by Reading status.
- Real Covers, found by ISBN (Open Library; Google Books with a key). Spines and backs are generated from each Cover: colour from its left edge, title and author typeset along the Spine, a real ISBN barcode on the back.
- Hover a Book: it eases forward and catches the light. Click: it comes out to you showing its Cover; click again for the back, again to put it away. Drag to spin it.
- **Stack** view: the whole Library as one pile you scroll through smoothly.

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

## Getting your Goodreads export

Goodreads → My Books → Import and export → **Export Library**. You get `goodreads_library_export.csv`. The file is parsed in your browser; only ISBN, title and author are sent to the server to look up covers.
