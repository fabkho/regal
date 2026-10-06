# layer-host fixture

A minimal Nuxt app that `extends` the Regal repo root as a layer, the way the
portfolio's `/books` page does (`app/pages/books.vue`), a profile page with
two `RegalBooksRow` cards (`app/pages/profile.vue`) and two rows in cards too
narrow for their Books, for the rest position (`app/pages/rest.vue`), and three rows over a Library whose months are a Book or two apart, for the dates (`app/pages/labels.vue`, `public/books/close-months.json`), and a Home that preloads Regal (`app/pages/warm.vue`, `preloadRegal`) before the shelf's row (`app/pages/shelf.vue`), over `public/books/preload.json`. and a client-only `/retry` (`app/pages/retry.vue`) whose library request the test fails, for the retry paths. `tests/e2e/layer-host.test.ts` builds it.

`public/books/` is a **synthetic** Library, never real reading data:

- `close-months.json`: 17 synthetic Books over twelve months, a Book or two apart (the dates' collision test).
- `preload.json`: `library.json`'s four Books with assets, given Spine colours, so their Spines can be drawn ahead (the preload test).
- `library.json`: a [Regal library file](../../../docs/library-file.md) (`librarySrc`), made from the old
  reading-tracker fixture with `pnpm library:convert` (the bridge for v1 data). Its image references
  are relative to the file (`fx-001/front.webp`).
- `<book id>/{front,spine,back}.webp`: plain coloured faces. `fx-004` also has
  Spine colours; `fx-005` has no assets at all, so Regal draws it.
