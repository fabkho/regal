# layer-host fixture

A minimal Nuxt app that `extends` the Regal repo root as a layer, in `embed`
mode, the way the portfolio's `/books` page does. `tests/e2e/layer-host.test.ts`
builds it.

`public/books/` is a **synthetic** Library and asset set (made-up books and
plain coloured webp faces), never real reading data:

- `library.json`: `reading list --json` shape (reading-tracker CLI)
- `manifest.json` + `<book id>/{front,spine,back}.webp`
