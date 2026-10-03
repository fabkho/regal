# Domain glossary

Use these terms in code, issues and commits.

| Term | Meaning |
|---|---|
| **Library export** | The CSV a user downloads from Goodreads (`goodreads_library_export.csv`). Raw input, never stored server-side. |
| **Regal library file** | The one input Regal's display reads: a versioned JSON (`version: 2`) with every **Book** of a **Library** and its resolved assets (front/Spine/back/pile images, Spine colours, blurb). Format: `docs/library-file.md`; types and validator in `shared/`. Written by a **Pipeline**. |
| **Pipeline** | A producer of the **Regal library file**: gathers reading data and Book assets from its sources and writes the file. Today the daily build from the reading tracker (`books:daily`, `scripts/assets`, `pnpm library:convert`), later Libellus. Regal itself doesn't care where the data comes from. |
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
| **Cover resolver** | Pipeline code (`server/utils/covers.ts`) that finds a Cover for a Book by walking **Cover sources** in order. Not part of the display any more. |
| **Cover source** | One upstream lookup strategy (Open Library by ISBN, Open Library search, Google Books, Goodreads page). |
| **Placeholder cover** | Procedurally drawn front used when the library file has no front image for a Book (or it doesn't load). |
| **View** | How the Library is shown: the **Bookcase** (Books standing on Shelves) or the **Stack**. |
| **Stack** | View without furniture: every Book lying flat in one scrollable pile, Spines towards the viewer, what you're reading now on top. |
| **Pose** | Where a Book rests in a View (position, rotation, dimensions). A Shelf **Placement** is a Pose plus its Bookcase and Shelf slot. |
| **Pick** | The interaction of pulling a Book off the Shelf / out of the Stack into the **Inspect** view. Click cycles front → back → put away. |
| **Face** | Which side a picked Book shows: `front` (the Cover) or `back`. |
| **Inspect** | State where a picked Book faces the camera with its details panel open. |
| **Return** | Animation putting an inspected Book back into its Placement. |
| **Demo library** | The synthetic **Regal library file** Regal's own site shows (`demo/demo-library.json`, a copy of `tests/fixtures/library-file/demo.json`). |
