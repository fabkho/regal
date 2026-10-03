# layer-host fixture

A minimal Nuxt app that `extends` the Regal repo root as a layer, the way the
portfolio's `/books` page does. `tests/e2e/layer-host.test.ts` builds it.

`public/books/` is a **synthetic** Library, never real reading data:

- `library.json`: a [Regal library file](../../../docs/library-file.md) (`librarySrc`), made from the old
  reading-tracker fixture with `pnpm library:convert` (the bridge for v1 data). Its image references
  are relative to the file (`fx-001/front.webp`).
- `<book id>/{front,spine,back}.webp`: plain coloured faces. `fx-004` also has
  Spine colours; `fx-005` has no assets at all, so Regal draws it.
