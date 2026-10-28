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
| **Flat faces** | A Book given its one colour (`assets.color` in the **Regal library file**, no Spine art): its **Spine** and back are drawn flat in that colour, title/author in ink or paper by contrast, a quiet title block on the back; the front stays the **Cover**. In the **Stack** its typeset Spine exists only near the view. |
| **In-memory library** | A **Regal library file**'s content handed to a component as an object (`library` prop) instead of a URL: validated and shown, nothing fetched. |
| **Placeholder cover** | Procedurally drawn front used when the library file has no front image for a Book (or it doesn't load). |
| **View** | How the Library is shown: the **Bookcase** (Books standing on Shelves), the **Stack**, the **Row** (in a card), or the **Reel** (in a card). |
| **Stack** | View without furniture: every Book lying flat in one scrollable pile, Spines towards the viewer, what you're reading now on top. |
| **Row** | The Stack turned 90° for a card (`RegalBooksRow`): the Books standing pressed together left to right, oldest first, scrolled sideways. |
| **Reel** | A **Library** as Books standing on an arc for a card (`RegalBooksReel`): one in front, square to you, its neighbours turned so their **Spines** show; the next comes forward every **beat** (3.2 s: a 0.8 s move, a 2.4 s hold) for one round, then it rests. A swipe, a tap, an arrow key or Pause take over (**Manual**); a tap on the Book in front takes it out with the Stack's **Detail panel** (**Detail**). Its own **In-memory library** and **Pick**. Pure parts in `app/utils/reel/` (layout, timeline, state, drag, scene). |
| **Haptics** | Short feedback when a Book is taken out, put back or passes the focus line under a finger (`useBookHaptics`): `navigator.vibrate` patterns on Android; on iOS 18+ one light system tap per pulse via a hidden `<input type="checkbox" switch>` toggled through its label (`utils/books/iosHaptic.ts`; a WebKit side effect Apple may change). Off with `runtimeConfig.public.regal.haptics: false` or Reduce Motion. |
| **Beat** | One Book's turn in a **Reel**: the arc moves one place on `standard`, then holds; the host's pills and caption fade in once it lands and out before the next move. |
| **Pose** | Where a Book rests in a View (position, rotation, dimensions). A Shelf **Placement** is a Pose plus its Bookcase and Shelf slot. |
| **Pick** | The interaction of pulling a Book off the Shelf / out of the Stack into the **Inspect** view. Click cycles front → back → put away. The Stage, the Sidebar and the accessible list share one (the global Pick); `RegalBooksRow` has its own (its `RowContext`); `RegalBooksReel` provides a **Pick context** of its own; a hosting view can provide a **Pick context** of its own (`providePickContext`, `utils/books/pickContext.ts`: the pick, hover, focus, insets, morph and its own Books) that the details card, labels and morph below it use instead; it mounts its own `BooksDetails` and `BooksLabelMorph` under the provider. |
| **Face** | Which side a picked Book shows: `front` (the Cover) or `back`. |
| **Inspect** | State where a picked Book faces the camera with its details panel open. A drag turns it: a turntable (the Stage's default) or freely about both axes (`rotate="free"`, the row's default; `utils/books/spin.ts`). |
| **Tooltip** | The small label with a Book's title and stars: beside the pointer on hover (hover label), beside the focused Book while scrolling the Stack (scroll focus label), under the Book in focus in `RegalBooksRow` (its focus label), the host's pills and caption under the Book in front in `RegalBooksReel`. |
| **Detail panel** | The picked Book's details next to it in **Inspect**: a card, on narrow stages a bottom sheet; in `RegalBooksRow` the details under or beside the Book (broken out: the sheet or a card); in `RegalBooksReel` the Stack's own (`BooksDetails`: the sheet on a phone, the card wider), always broken out. |
| **Theme tokens** | The `--regal-*` CSS custom properties hosts set to restyle the **Tooltip**, the **Detail panel** and `RegalBooksRow`'s card (its frame alone: `--regal-row-*`; its broken-out sheet: `--regal-sheet-*`); with `theme` (light/dark/auto), slots and `unstyled` (`docs/nuxt-layer.md`, "Theming"). |
| **Book list** | The visually hidden, accessible list of the visible **Books** beside a canvas (`RegalBooksRow`, `RegalBooksStage`; `accessible-list`): a button each (title, author, month finished, rating in words) that takes the Book out like a tap. The **Detail panel** of a Book taken out is a dialog. |
| **Return** | Animation putting an inspected Book back into its Placement. |
| **Demo library** | The synthetic **Regal library file** Regal's own site shows (`demo/demo-library.json`, a copy of `tests/fixtures/library-file/demo.json`). |
