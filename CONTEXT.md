# Domain glossary

Use these terms in code, issues and commits.

| Term | Meaning |
|---|---|
| **Library export** | The CSV a user downloads from Goodreads (`goodreads_library_export.csv`). Raw input, never stored server-side. |
| **Library** | The normalized, in-memory list of **Books** produced from a Library export. Persisted only in the user's browser. |
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
| **Cover** | The front image of a Book, fetched by the **Cover resolver**. |
| **Cover resolver** | Server endpoint that finds a Cover for a Book by walking **Cover sources** in order and proxies the image same-origin. |
| **Cover source** | One upstream lookup strategy (Open Library by ISBN, Open Library search, Google Books, Goodreads page). |
| **Placeholder cover** | Procedurally generated cover used when no Cover source succeeds. |
| **View** | How the Library is shown: the **Bookcase** (Books standing on Shelves) or the **Stack**. |
| **Stack** | View without furniture: every Book lying flat in one scrollable pile, Spines towards the viewer, what you're reading now on top. |
| **Pose** | Where a Book rests in a View (position, rotation, dimensions). A Shelf **Placement** is a Pose plus its Bookcase and Shelf slot. |
| **Pick** | The interaction of pulling a Book off the Shelf / out of the Stack into the **Inspect** view. Click cycles front → back → put away. |
| **Face** | Which side a picked Book shows: `front` (the Cover) or `back`. |
| **Inspect** | State where a picked Book faces the camera with its details panel open. |
| **Return** | Animation putting an inspected Book back into its Placement. |
| **Demo library** | Bundled, sanitized sample Library shown before the user uploads anything. |
