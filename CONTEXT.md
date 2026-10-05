# Domain glossary

Use these terms in code, issues and commits.

| Term | Meaning |
|---|---|
| **Regal library file** | The one input Regal's display reads: a versioned JSON (`version: 2`) with every **Book** of a **Library** and its resolved assets (front/Spine/back/pile images, Spine colours, blurb). Format: `docs/library-file.md`; types and validator in `shared/`. Written by a **Pipeline**. |
| **Pipeline** | A producer of the **Regal library file**: gathers reading data and Book assets from its sources and writes the file. Today Libellus (`pnpm export:regal`); `pnpm library:convert` remains as a bridge for old published data. Regal itself doesn't care where the data comes from. |
| **Regal assets** | The step between a **Pipeline** and the display (`pipeline/`, `pnpm regal-assets`): takes any **Regal library file** and returns it with each Book's assets (fronts, Spines, backs, pile copies, colours, missing blurbs) and the images, published to R2 under `v2/`. |
| **Library** | The normalized, in-memory list of **Books** Regal shows, read from a **Regal library file**. Nothing is kept in the browser. |
| **Book** | One normalized entry: identifiers (Goodreads id, ISBN-10, ISBN-13), title, author, page count, binding, rating, dates, review, **Reading status**. |
| **Reading status** | Goodreads' exclusive shelf: `read`, `currently-reading`, `to-read`, or a custom exclusive shelf (e.g. `wishlist`). Not the same as a 3D **Shelf**. |
| **Tags** | Goodreads' non-exclusive "Bookshelves" (e.g. `favorites`). |
| **Bookcase** | The 3D furniture object. Contains one or more **Shelves**. |
| **Shelf** | One horizontal board in the Bookcase that Books stand on. |
| **Section** | A labelled group of consecutive Books on the Bookcase (by Reading status, year read, author …), separated by a **Divider**. |
| **Layout** | The pure computation that turns a Library + options into **Placements**. |
| **Placement** | Where one Book sits: shelf index, position, dimensions, lean/stack orientation. |
| **Book dimensions** | Height, width (cover), thickness (spine). Thickness derived from page count; height from binding plus deterministic jitter. |
| **Spine** | The visible side of a shelved Book: colour + title/author text rendered to a texture. |
| **Cover** | The front image of a Book, listed in the **Regal library file** (found by a **Pipeline**). |
| **Cover resolver** | **Regal assets** code (`pipeline/src/assets/front.ts`, `pipeline/src/resolvers/`) that finds a Cover for a Book by walking **Cover sources** in order. Not part of the display. |
| **Cover source** | One upstream lookup strategy (Apple Books, the German National Library, Google Books, Open Library by ISBN or title). |
| **Placeholder cover** | Procedurally drawn front used when the library file has no front image for a Book (or it doesn't load). |
| **View** | How the Library is shown: the **Bookcase** (Books standing on Shelves), the **Stack**, or the **Row** (in a card). |
| **Stack** | View without furniture: every Book lying flat in one scrollable pile, Spines towards the viewer, what you're reading now on top. |
| **Row** | The Stack turned 90° for a card (`RegalBooksRow`): the Books standing pressed together left to right, oldest first, scrolled sideways. |
| **Pose** | Where a Book rests in a View (position, rotation, dimensions). A Shelf **Placement** is a Pose plus its Bookcase and Shelf slot. |
| **Pick** | The interaction of pulling a Book off the Shelf / out of the Stack into the **Inspect** view. Click cycles front → back → put away. |
| **Face** | Which side a picked Book shows: `front` (the Cover) or `back`. |
| **Inspect** | State where a picked Book faces the camera with its details panel open. |
| **Return** | Animation putting an inspected Book back into its Placement. |
| **Demo library** | The synthetic **Regal library file** Regal's own site shows (`demo/demo-library.json`, a copy of `tests/fixtures/library-file/demo.json`). |
