# Regal

*Regal* is German for shelf.

A reading library as a 3D bookcase. Pull a book off the shelf, turn it around, see what you thought of it.

Regal is only the display: it renders one input, the [Regal library file](docs/library-file.md). Where the reading data comes from (a reading tracker, Goodreads, [Libellus](https://github.com/fabkho/libellus)) is the business of whatever writes that file, a **Pipeline**.

Built with Nuxt 4 and [TresJS](https://tresjs.org) (three.js for Vue).

## What it does

- Point it at a Regal library file (the site shows a demo; `?src=<url>` any other) and its Books stand on an antique Bookcase — sized by page count and binding, grouped by Reading status.
- Covers, Spines and backs come with the file. What it lacks is drawn: a placeholder front, the colour sampled from the front's left edge, title and author typeset along the Spine, the blurb and ISBN barcode on the back.
- Hover a Book: it eases forward and catches the light. Click: it comes out to you showing its Cover; click again for the back, again to put it away. Drag to spin it.
- The picked Book's details (rating, review, blurb, Goodreads) come in a card beside it; on narrow screens a bottom sheet on the screen's bottom edge, reaching at most 30% up the stage; title, author, rating and the actions always show, the blurb and review scroll below them, and dragging it down puts the Book back. The Book sits centred in the space left between the sheet and whatever covers the stage's top.
- **Row**: the Stack turned on its side for a card in another page (`/row`; `RegalBooksRow` in a host): the Books stand pressed together left to right, oldest first, what you read last on the right where it starts, each month after a hairline sheet with its date above. Swipe or drag it sideways; Books passing the middle tip out as if pulled by the head. A Book taken out stays in the card or breaks out to the whole screen.
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
| `theme` | `'light'` | Colour scheme of the tooltip and the Book detail panel (and `RegalBooksRow`'s card) where a component doesn't set its `theme` prop: `'light'` (Regal's look), `'dark'` or `'auto'` (follows the host). See [Theming](#theming). |
| `haptics` | `true` | Short vibrations on phones that can (Android Chrome; iOS Safari has no Vibration API): a soft double pulse when a Book is taken out (10 ms, a 45 ms pause, 18 ms), one pulse when it is put back (10 ms), and a tiny tick (1 ms, at most ~16 a second) each time a new Book reaches the focus line while a finger scrolls the Stack. Only with the user's own taps and swipes, never with reduced motion. `false` turns them all off. |

Env override as usual: `NUXT_PUBLIC_REGAL_LIBRARY_SRC=…`, `NUXT_PUBLIC_REGAL_HAPTICS=false`, `NUXT_PUBLIC_REGAL_THEME=auto`.

To turn haptics off on a host page:

```ts
// nuxt.config.ts of the host
export default defineNuxtConfig({
  extends: [/* Regal */],
  runtimeConfig: { public: { regal: { librarySrc: '/books/library.json', haptics: false } } },
})
```

**The scroll ticks and the first tap.** Chrome only lets a page vibrate once the user has tapped, clicked or typed in it ("sticky user activation", `navigator.userActivation.hasBeenActive`); a swipe that scrolls doesn't count (its touch ends as a `pointercancel`). So on a page opened fresh (a reload, a shared link, a PWA start) the ticks of the first swipes stay silent until the first tap anywhere in the document: taking a Book out is one, so is the host's link that led to the page if the navigation kept the document (an SPA route change). After that they come with every swipe. Regal itself keeps no state of its own that a pick would set: the ticks follow the focus line and the finger only (checked with the activation granted from the start: they tick before any Book was taken out). Taking out and putting back pulse within the tap itself, so they always can.

**Changed with the library file** ([#39](https://github.com/fabkho/regal/issues/39)): `mode` and `assetsBase` are gone. There is one way to get a Library (the file at `librarySrc`, its images listed in it), so a host that still sets them gets no error, they are ignored; drop them when you switch. `librarySrc` now names a library file, not a reading-tracker export (Libellus writes one; `pnpm library:convert` converts old published data, see below); such an export shows the error card. The Cover and description resolvers (`/api/cover`, `/api/description`, `NUXT_GOOGLE_BOOKS_API_KEY`) are no longer part of the layer.

### Components

```vue
<!-- body -->
<RegalBooksStage class="books-stage" />
<!-- the host's sidebar -->
<RegalBooksSidebar heading="Bookshelf" count-label="Books read" />
<!-- a card in another page: a profile, a year in review -->
<RegalBooksRow class="books-row" inspect="auto" :limit="80" />
<RegalBooksRow class="books-row" :year="2025" />
```

- **`RegalBooksStage`**: the 3D Stack only (no Bookcase/Stack switch), the picked Book's details card over it. On narrow stages (≤ 560 px) the details are a bottom sheet instead: it sits on the viewport's bottom edge (in `<body>`, `position: fixed`) while a Book is out, covering what the host has under the stage, at `z-index: var(--regal-sheet-z-index, 15)`: above page content, below sticky bars at 20 and up. Give it a height (it fills its box; `min-height: 24rem`). Prop `controls` (default `false`) adds the sort & filter chips over the 3D; `rotate` (`'turntable'`) how a drag turns a picked Book: `'turntable'` turns it left/right and tips it at most ~75° (as always), `'free'` spins it about both axes like a trackball and lets it glide on after a quick release (the row's default); `theme`, `unstyled` and the `#tooltip` / `#detail…` slots theme the tooltip and the detail panel ([Theming](#theming)).
- **`RegalBooksSidebar`**: the count of read Books, the Stack's sort/year/rating filters and the Books as records (hover lifts the Book in the 3D, click takes it out). Props: `heading` (`'Bookshelf'`, `''` hides it), `countLabel` (`'Books read'`), `filters` (`true`), `list` (`true`); `theme`, `unstyled` and the `#detail…` slots for the detail panel it shows while a Book is out. Fills the height it gets; the records scroll. Its filters section has the class `sidebar__filters`, so a host can hide it where `RegalBooksFilters` takes over.
- **`RegalBooksRow`**: the Library as one horizontal row for a card: the Stack turned 90°, the Books pressed together left to right (oldest first, the row starts at the newest), each month after a hairline sheet with its date above (`MAR`, the year small), the Stack's hover and, while you scroll, Books passing the middle tipping out as if pulled by the head, with the title and stars of the one in focus under it. The Book in focus is always the one in the card's middle, the first and the last too: the scroll has room before the first Book and after the last (half the card), so the row at rest has the newest Book in the middle (or January's first with `year`), and the focus label stays in one place, centred under the row (a long title is cut short with …). It scrolls with the browser's own horizontal scrolling: a sideways swipe scrolls the row, an up/down swipe the page (nothing is trapped); a trackpad, Shift+wheel, a mouse drag, the ‹ › buttons and the arrow keys (once focused) too. A tap or click takes a Book out, again turns it; a drag spins it freely (up/down tips it, left/right turns it, a quick release lets it glide on; in the card a finger's up/down swipe still scrolls the page), a sideways flick turns it over; the Back button, the browser's Back, Escape or a tap beside it put it back. Give it a size (it fills its box; `min-height: 18rem`; a phone card of 360 × 300 shows about 20 Books). Props:
  - `inspect` (`'card'`): where a Book taken out is looked at. `'card'` keeps it in the card (the camera steps back, the Book comes forward and grows a little; the details under it, or beside it on a wide card). `'viewport'` breaks out: the row's canvas moves into a fixed box over the whole viewport (the row stays exactly in place), the Book comes to the middle of the screen with its details as a bottom sheet (≤ 560 px wide) or a card at the bottom right, the page is veiled and does not scroll until the Book is back in the row. `'auto'`: the viewport on narrow screens (≤ 560 px), the card elsewhere. Broken out it sits at `z-index: var(--regal-row-z-index, 40)`, above the host's page and its sticky bars; it moves to `<body>`, so a CSS transform on the card's ancestors doesn't trap it.
  - `limit` (`null`): only the newest this many Books (read and being read).
  - `year` (`null`): only the Books read in that year; the row then starts at January.
  - `back-button` (`true`): Regal's Back button while a Book is out. `false` hides it (e.g. with your own close in `#detail`); Escape, the browser's/Android's Back, a tap beside the Book and the details' `close` still put it back. The `#back="{ book, close, broken }"` slot replaces it with your own markup in its place (top left of the card; broken out, of the screen).
  - `rotate` (`'free'`): how a drag turns a Book taken out: `'free'` (a trackball, both axes), or `'turntable'` (the Stage's: left/right, a little tip, only left/right for a finger in the card).
  - `label` (`''`): the row's accessible name (default "Books read", "Books read in 2025").
  - `theme`, `unstyled` and the `#tooltip` / `#detail…` slots, as on `RegalBooksStage` ([Theming](#theming)): the card, its focus label and details, also broken out.

  It has its own Pick (not shared with `RegalBooksStage` and the sidebar), so it can sit on any page beside them. Spines are drawn at the size the card shows them and a front loads only when its Book is taken out; the canvas renders only when something moves and only while the row is on screen.
- **`RegalBooksFilters`**: the same sort & filters as one bar for a phone, to sit above `RegalBooksStage`: a line with the current choices ("Date read · Year · All years · All ratings") that opens a panel over the page. The bar is `--regal-filter-bar-height` tall (default `2.8rem`), so the host can size the stage below it in CSS; give it a `z-index` above the 3D when it is sticky. The portfolio shows it under 1025 px and hides the sidebar's filters there.

On a tall, narrow stage (a phone) the pile starts with its top Book at about 80 % of the stage's height instead of mid-view (`app/utils/stack/camera.ts`); wide stages are unchanged.

All of them load the Library from `librarySrc` themselves (server-side when possible, so the records are in the HTML; one fetch) and share it; the Stage, the Sidebar and the Filters also share the Stack's sort & filters (kept in the URL: `?sort=rating&year=2025&min=4`; `group=year|month|off` sets the date separators, default by year), the picked Book and the hovered one. They work on the same page in any layout, also when one sits in a layout and the other in the page.

The look is the decided one: re-sorts move by hand when up to 3 Books move, as a carousel above that; Books a filter brings back pop in scattered around the pile and leaving ones slide out and shrink away, and when no Book stays (a new year) the old pile sweeps out to the left before the new one settles in from the bottom up (instant with reduced motion); classic back covers; title and stars in the hover label; while you scroll the Stack (and on touch screens), Books passing the middle of the view riffle out, the centred one with that label.

**Styling.** The tooltip, the detail panel and `RegalBooksRow`'s card have their own tokens, `--regal-*` ([Theming](#theming)). The rest (the sidebar, the filters, the stage's notes) use the paper-ink tokens with fallbacks, e.g. `var(--color-ink, #2C2C2A)`, so they look right with or without them. A host that defines the same tokens (`--color-bg`, `--color-ink`, `--color-ink-muted`, `--color-ink-faint`, `--color-line`, `--color-accent`, `--color-accent-tint`, `--font-mono`, `--font-serif`, `--text-2xs` … `--text-2xl`) restyles them; set them on a wrapper to change only Regal. The `--regal-*` defaults of the light theme read them too, so a host that already maps them keeps that look. Regal registers the IBM Plex Mono, Patua One and Antonio `@font-face`s (no other global CSS).

Regal's composables (`useLibrary`, `useBookPick`, `useStackView`, `useRegalConfig` …) are auto-imported into the host too; avoid those names in the host.

### Theming

`RegalBooksStage` and `RegalBooksRow` take the host's look the same way, with the same tokens, the same `theme` prop, the same slots and `unstyled` (`RegalBooksSidebar`: `theme`, `unstyled` and the detail slots, for the panel it shows while a Book is out). Regal's DOM around the 3D is themed:

- `RegalBooksStage`: the **tooltip** (the hover label, the Stack's scroll focus label, the morph box between label and card) and the **Book detail panel** (the card, the bottom sheet on phones).
- `RegalBooksRow`: the card itself (its surface and frame, the month/year labels with their leader lines, the scroll indicator, the ‹ › and Back buttons), its **tooltip** (the focus label: title and stars under the Book in focus) and its **detail panel** (the details under or beside the Book in the card; broken out, `inspect="viewport"`, the phone's sheet or the card at the bottom right). The veil behind a Book taken out is the card's surface colour: paper by default, dark in the dark theme, the host's `--regal-surface` when set.

Three ways, from light to full control. Regal always keeps placing them, opening and closing (click, Escape, the sheet's drag, the host's Back via `putAway`; Back and a tap beside the Book in the row), the label ↔ card morph, the row's break-out and the swap between Books. The 3D (Books, lights, the row's hairline sheets) is not themed.

**1. Tokens.** Every colour, frame, type and spacing value of these parts is a CSS custom property. Set them anywhere above Regal: on `:root`, on your theme's `[data-theme="dark"]` rule, or on the class you give the component. Parts that live in `<body>` (the hover label, the morph box, the phone's sheet; a broken-out row's canvas box with its labels, Back and the details) get the values the component resolved, so a token on the wrapper reaches them too. Unset ones fall back to the theme's defaults. Regal's own values live on a `.regal` scope (the component's root and each surface), never on `:root`. One table for both components (– : not used there); the row keeps its own smaller type and paddings, so a few tokens only reach it once set (the table says so):

| Token | Light default | Dark default | `RegalBooksStage` | `RegalBooksRow` |
|---|---|---|---|---|
| `--regal-surface` | `var(--color-bg, #F5F2EB)` | `#1F1E1B` | Tooltip background | The card, the focus label, ‹ › and Back; the veil behind a Book taken out |
| `--regal-surface-raised` | `--regal-surface` | `#262420` | Detail panel background; button text on hover | The details |
| `--regal-ink` | `var(--color-ink, #2C2C2A)` | `#ECE8DF` | Text; button background on hover | Text, the month/year labels and their leader lines, the scroll indicator |
| `--regal-ink-muted` | `var(--color-ink-muted, #6B6B69)` | `#A8A399` | Meta line, labels, rating value | The line under the title, the hint |
| `--regal-ink-subtle` | `var(--color-ink-subtle, rgba(44, 44, 42, 0.72))` | `rgba(236, 232, 223, 0.75)` | Button text | – |
| `--regal-ink-faint` | `var(--color-ink-faint, rgba(44, 44, 42, 0.55))` | `rgba(236, 232, 223, 0.5)` | The sheet's grip | "No books to show" |
| `--regal-accent` | `var(--color-accent, #B93E2E)` | `#E0705F` | Stars, links | Stars, the month's count, "Turn over", ‹ › and Back on hover, the focus ring |
| `--regal-accent-hover` | `var(--color-accent-light, #E8665A)` | `#F0907F` | Links on hover | – |
| `--regal-hairline` | `var(--color-line, rgba(44, 44, 42, 0.14))` | `rgba(236, 232, 223, 0.16)` | Empty stars, the review's rule | Empty stars, the scroll track |
| `--regal-border` | `var(--color-ink, #2C2C2A)` | `rgba(236, 232, 223, 0.28)` | Frame of the tooltip, the panel and its buttons | Frame of the card, the focus label, the details and the buttons |
| `--regal-border-width` | `1px` | | `0` for frameless surfaces | The same frames |
| `--regal-radius` | `0` | | Corner radius of the tooltip and the panel | Corners of the card, the focus label and the broken-out details (the sheet's top ones) |
| `--regal-radius-control` | `0` | | Corner radius of the panel's buttons | Corners of ‹ › and Back |
| `--regal-shadow` | `none` | `0 10px 30px rgba(0, 0, 0, 0.45)` | `box-shadow` of the tooltip and the panel | The focus label and the broken-out details |
| `--regal-backdrop` | `none` | | `backdrop-filter`, e.g. `blur(12px)` with a translucent surface | The focus label and the broken-out details |
| `--regal-font-body` | `var(--font-mono, 'IBM Plex Mono', …)` | | Everything but the title | Everything |
| `--regal-font-title` | `var(--font-serif, 'Times New Roman', …)` | | The panel's title | The details' title, once set (else the body font) |
| `--regal-size-base` | `var(--text-base, 0.85rem)` | | The panel's base size | – |
| `--regal-size-title` | `var(--text-xl, 1.2rem)` | | Title in the card | – |
| `--regal-size-title-sheet` | `var(--text-lg, 1.05rem)` | | Title in the phone's sheet | – |
| `--regal-size-body` | `var(--text-sm, 0.75rem)` | | Author, review | The card's base size: the details and their title |
| `--regal-size-small` | `var(--text-xs, 0.7rem)` | | Tooltip, blurb, buttons, links | The month labels |
| `--regal-size-label` | `var(--text-2xs, 0.65rem)` | | Series, meta line, "About", the hint | The focus label, the year and count, Back, the line under the title, the blurb, the hint |
| `--regal-weight-title` | `400` | | The panel's title | The details' title, once set (else `600`) |
| `--regal-weight-label` | `400` | | Labels | – |
| `--regal-style-title` | `italic` | | The panel's title | The details' title, once set (else `normal`) |
| `--regal-label-case` | `uppercase` | | `text-transform` of labels and the meta line | The labels, Back, "No books to show" |
| `--regal-label-tracking` | `0.08em` | | Their `letter-spacing` | The year and count, Back |
| `--regal-space` | `1rem` | | Unit of every margin and gap (they are multiples of it) | – |
| `--regal-tooltip-padding` | `0.3rem 0.55rem` | | The tooltip's | The focus label's, once set (else `0.2rem 0.45rem`) |
| `--regal-panel-padding` | `1rem 1.1rem` | | The card's padding (the sheet uses `--regal-space`) | The broken-out details card's, once set (else `0.9rem 1rem`) |

**2. Colour scheme.** `theme` on `RegalBooksStage` / `RegalBooksRow` / `RegalBooksSidebar` (default: `runtimeConfig.public.regal.theme`, `'light'`): `'light'` is Regal's look, `'dark'` the dark set above, `'auto'` follows the host: the nearest `data-theme="dark|light"` (or `data-color-scheme`, or a `dark` / `light` class) on an ancestor or `<html>`, else a `color-scheme` there that names one scheme, else the OS (`prefers-color-scheme`); it watches all three. Regal sets `color-scheme` on its surfaces to match (scrollbars, form controls), and the resolved scheme is on the root as `data-regal-theme`, for the host's own rules (`.regal[data-regal-theme="dark"] { --regal-accent: … }`).

```vue
<!-- A dark host that switches with <html data-theme>: the same tokens for both -->
<RegalBooksStage class="shelf" theme="auto" />
<RegalBooksRow class="shelf shelf--row" theme="auto" inspect="auto" />

<style>
.shelf {
  --regal-surface: var(--color-surface);
  --regal-surface-raised: var(--color-surface-raised);
  --regal-ink: var(--color-ink);
  --regal-ink-muted: var(--color-ink-muted);
  --regal-accent: var(--color-accent);
  --regal-hairline: var(--color-hairline);
  --regal-border: var(--color-hairline);
  --regal-radius: 12px;
  --regal-font-title: var(--font-serif);
}
</style>
```

**3. Slots.** Your own markup and components inside Regal's frame. Pass them to `RegalBooksStage` or `RegalBooksRow` (the detail ones also to `RegalBooksSidebar`); each gets the Book (the normalized `Book`, `shared/types/book.ts`) and what it needs:

| Slot | Props | Replaces in `RegalBooksStage` | Replaces in `RegalBooksRow` |
|---|---|---|---|
| `#tooltip` | `{ book }` | Title and stars in the hover and scroll focus labels | Title and stars in the focus label under the Book in focus |
| `#detail` | `{ book, close, flip, face, sheet }` | The whole panel content (it scrolls as one in the sheet) | The whole details content (Back stays Regal's) |
| `#detail-header` | `{ book }` | Series, title, author, rating and meta line | Title and the line under it |
| `#detail-meta` | `{ book, meta }` | Only the meta line (`meta`: `['Read', 'Finished 1 Mar 2025', '200 pages', 'Paperback']`) | Only the line under the title, stars included (`meta`: `['Ada Example', '1 Mar 2025']`, the author and the date read) |
| `#detail-about` | `{ book, description }` | The "About" part with the blurb (shown for Books without one too when passed) | The blurb, on a wide card and broken out (shown for Books without one too when passed); the owner's review stays |
| `#detail-actions` | `{ book, close, flip, face }` | Show back / Put back / Goodreads | "Turn over · drag or flick to turn" |
| `#back` | `{ book, close, broken }` | – | The Back button while a Book is out (`broken`: the row broke out to the viewport); `:back-button="false"` hides it instead |

`close` puts the Book back (like Escape), `flip` turns it, `face` is `'front'` or `'back'`, `sheet` is true in the phone's sheet (the Stage's, or the row's broken out on a phone). The tooltip, the sheet and a broken-out row's details render in `<body>`: style slot content with your component's scoped classes (they come along) rather than descendant selectors from your page.

```vue
<RegalBooksStage theme="auto">
  <template #tooltip="{ book }">
    <BookTitle :book="book" />
  </template>
  <template #detail="{ book, close }">
    <BookSummary :book="book" />
    <UiButton @click="close">Done</UiButton>
  </template>
</RegalBooksStage>
```

**The row's card and sheet.** A few tokens only `RegalBooksRow` reads, for a host that puts the row in its own card or its own markup in the broken-out phone sheet (`#detail`). Unset, the look above. Set them on the class you give the row (the sheet's are carried to `<body>` with it):

| Token | Default | What |
|---|---|---|
| `--regal-row-border` | `var(--regal-border-width) solid var(--regal-border)` | The card's border (`0` or `none`: frameless) |
| `--regal-row-radius` | `--regal-radius` | The card's corners |
| `--regal-row-background` | `--regal-surface` | The card's background (`transparent`: the host's card shows through; the veil behind a Book taken out then takes the colour behind) |
| `--regal-row-z-index` | `40` | Broken out: the canvas box, the sheet and Back sit at this (+1) |
| `--regal-sheet-radius` | `--regal-radius` | The sheet's top corners |
| `--regal-sheet-background` | `--regal-surface-raised` | The sheet's background |
| `--regal-sheet-border` | `var(--regal-border-width) solid var(--regal-border)` | The sheet's border (only its top edge shows) |
| `--regal-sheet-shadow` | `--regal-shadow` | The sheet's `box-shadow` |
| `--regal-sheet-padding` | `0.8rem 1rem 1rem` | The sheet's padding; `0` lets a `#detail` slot fill it edge to edge |
| `--regal-sheet-max-width` | `none` | The sheet's most width (centred when narrower than the screen) |
| `--regal-sheet-max-height` | `34dvh` | The sheet's most height (it scrolls beyond) |
| `--regal-sheet-grabber` | `none` | `block` shows a grabber at the sheet's top; dragging it down puts the Book back |
| `--regal-sheet-grabber-color` | `--regal-ink-faint` | The grabber's colour |
| `--regal-sheet-grabber-width` | `2.25rem` | The grabber's width |
| `--regal-sheet-grabber-height` | `2px` | The grabber's height |

```vue
<!-- Libellus: the row inside its own card, its own sheet content -->
<RegalBooksRow class="year-row" theme="auto" inspect="viewport" :year="2025" :back-button="false">
  <template #detail="{ book, close }"><BookSheet :book="book" @close="close" /></template>
</RegalBooksRow>

<style scoped>
.year-row {
  --regal-row-border: 0;
  --regal-row-radius: 0;
  --regal-row-background: transparent;
  --regal-sheet-padding: 0;
  --regal-sheet-radius: 20px;
  --regal-sheet-border: 0;
  --regal-sheet-shadow: 0 -8px 30px rgb(0 0 0 / 0.2);
  --regal-sheet-max-width: 32rem;
  --regal-sheet-grabber: block;
}
</style>
```

**`unstyled`.** `<RegalBooksStage unstyled />` / `<RegalBooksRow unstyled />` keep the structure (classes `hover-label`, `focus-label`, `details`, `details__title` …; `row-card`, `row-focus`, `row-label`, `row-card__details` (`--sheet`, `--card` broken out), `row-card__back` …; each surface also `.regal.regal--unstyled`) and the layout (positions, padding, gaps, the sheet's grip), and drop Regal's colours, frame and type: they inherit from the host (the parts in `<body>` from `<body>`). Style them from global CSS, e.g. `.regal--unstyled.details { background: … }`. The row's card is then transparent and frameless, and its veil takes the colour that shows behind it (the nearest background up the page).

`pnpm dev` → `/dev/theming` shows them all (default, dark, auto, custom tokens, slots, part slots, unstyled; `?look=…`), the Stage and the row with the same props and slots (`?show=both|stage|row`, `?inspect=card|viewport` for the row).

### Static data

Regal reads one file: the [Regal library file](docs/library-file.md) (`version: 2`), every Book with its data and resolved assets (front, Spine and back images, small pile copies, Spine colours, blurb), validated when it loads. Put it anywhere (the host's `public/`, a CDN) and point `librarySrc` at it.

- Image references in it are absolute or relative to the file's own URL (`9780756413026/front.webp` next to the file). Images on another origin must allow CORS, as they become WebGL textures.
- A Book without an image gets the drawn one: a placeholder front, a typeset Spine and back.
- A file that doesn't load or isn't valid (another `version`, a reading-tracker export, a broken field) shows an error card with the first problems (`books[3].rating: must be …`), never an empty shelf.
- The Stack loads lazily from the file's `pile` copies: the Spines in and around the view first, then the rest of the pile in the background, and a Book's full front and back only once it is pointed at or taken out. Without `pile` copies the full faces stand in; without `palette` the Spine colours are sampled from the front in the browser.

`nuxt dev` note: a `public/books/` folder next to a `/books` page makes the dev server redirect `/books` to `/books/` (the page still renders). Production builds don't.

`tests/fixtures/layer-host/` is a minimal host (a synthetic library file) built by `tests/e2e/layer-host.test.ts`; `pnpm nuxi dev tests/fixtures/layer-host` runs it.

## Producing the library file

Three steps, each with one job:

```
Libellus (library:convert: bridge for old data) ──► library file ──► regal assets ──► library file + images (R2 v2/) ──► Regal display
```

1. **Produce.** Something writes a [Regal library file](docs/library-file.md) with the reading data. Today that is [Libellus](https://github.com/fabkho/libellus): its `regal-export` edge function for the workflow that publishes the shelf, `pnpm export:regal` there by hand (see [The daily chain](#the-daily-chain)). `pnpm library:convert` stays as a bridge for old published data: it turns a v1 `library.json` + `manifest.json` into a library file ([Converting](docs/library-file.md#converting-old-published-data)). Where the data comes from is the producer's business, not Regal's.
2. **Enrich: Regal assets** ([`pipeline/`](pipeline/README.md)). Takes any library file and returns it with each Book's `assets` (front, Spine, back, pile copies, palette, Spine colour, photo faces, source) and the images, plus a blurb for Books without one.
3. **Display.** Regal (this layer) renders the enriched file, nothing else.

### Running Regal assets

`pipeline/` is its own package (own `package.json` and lockfile, never installed by a host that extends the layer):

```bash
pnpm --dir pipeline install
pnpm regal-assets --in .data/library-v2.json --dry-run --no-ai   # = pnpm --dir pipeline assets …
```

- `--in <file|url>`: the library file, validated with the shared validator (invalid: the errors, nothing written). `--out <dir>` (default `.data/regal-assets/out`): `library.json` plus `<key>/{front,spine,back,front-pile,spine-pile}.webp`, `<key>` the ISBN-13 or the Book id; image references in the output are relative to it.
- Per Book: what the file brings and is good enough stays (copied into the output, so the published set doesn't depend on where the input's images live); a front below 800 px or none goes through today's front chain (Apple, the German National Library for German editions, Google, the file's own front, Open Library), the taller one wins; photo drop-ins (`<cache>/photos/<key>/front.jpg` …) beat everything; pile copies, palette and Spine colour are made from the faces; a Book without a blurb gets one (Apple's publisher copy, else Open Library/Google).
- AI Spines/backs (Gemini, `GEMINI_API_KEY` with billing) for Books with a front and no Spine/back art, through the Batch API (half price; `--now` for direct calls). A paid jacket is kept in the cache and never bought twice. `--no-ai` leaves them to Regal's drawn ones, `--no-model` skips the text model too.
- Incremental and idempotent: a Book is rebuilt only when what its assets are made of changed (its sizing and text fields, its input images' content, its photos); a run without changes rewrites nothing, not even `generatedAt`. Downloads, jackets, open batch jobs and the state live under `.data/regal-assets/` (`--cache`). `--revalidate` asks the servers whether input images changed behind the same URL; `--force` rebuilds anyway; `--limit <n>` takes only the n most recently read Books this run.
- `--publish v2` uploads what changed to the R2 bucket (`$REGAL_R2_BUCKET`, default `portfolio-books`; `wrangler login` once, or `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment as in the workflow) under `v2/`: images first, `library.json` last, files that are gone deleted. Only that prefix is ever written; the bucket root (the old v1 files) never, and an empty prefix is refused.
- `--dry-run`: nothing remote and nothing paid. No upload (the plan is printed), no Gemini call (the AI cost is printed, as today's build did); the free work runs and the local output is written, so the dry run shows the enriched file.

Books without a blurb now get theirs from Regal assets: the display has no description resolver any more, so a file that skips this step shows them without one.

**CORS.** The portfolio loads the images cross-origin as WebGL textures, so the bucket's domain (`books.fabkho.dev`) must answer with CORS headers for the page's origin (`https://fabkho.dev`, and any preview/dev origin that shows `/books`), for `v2/` as for the old v1 files.

### The daily chain

The shelf is published from the cloud ([libellus#110](https://github.com/fabkho/libellus/issues/110)) by the workflow [`publish-shelf.yml`](.github/workflows/publish-shelf.yml): [Libellus](https://github.com/fabkho/libellus) (hosted Supabase) serves the owner's library file from its `regal-export` edge function, and the workflow enriches and publishes it under `v2/`:

```
Libellus change ─► DB trigger (owner only, ≥ 10 min apart) ─► repository_dispatch libellus-changed ─┐
daily 05:00 UTC (schedule) ─────────────────────────────────────────────────────────────────────────┼─► publish-shelf
by hand (workflow_dispatch, dry_run / allow_shrink) ────────────────────────────────────────────────┘
publish-shelf: GET regal-export ─► validate ─► pnpm regal-assets --no-ai --no-model --revalidate --publish v2 ─► R2 portfolio-books/v2/
```

1. **Export.** `curl -H "Authorization: Bearer $REGAL_EXPORT_TOKEN" "$LIBELLUS_EXPORT_URL"`: the owner's Books read as a library file, with each Book's published art carried over (Libellus reads `books.fabkho.dev/v2/library.json` and keeps every matched Book's front, Spine and back, by ISBN-13, else by title plus the first author's surname), the member's own page count where she set one. The same file `pnpm export:regal --statuses read --carry-art …` writes in Libellus. When Libellus cannot read the published file it answers 502 and nothing is published, so the art is never dropped.
2. **Validate.** Regal's validator (`pipeline/src/layer.ts`), and a guard: an export with far fewer Books than the shelf shows now (more than 5 and 10 % fewer: a wrong owner, a broken read) is not published unless a manual run sets `allow_shrink`.
3. **Enrich and publish.** `pnpm regal-assets --in <file> --no-ai --no-model --revalidate --publish v2` with wrangler on an API token. `.data/regal-assets` (downloads, output, the state of the last publish) is kept in the Actions cache between runs, so a quiet run rebuilds and uploads nothing. A run with an empty cache (the first one, or after GitHub evicted it) rebuilds every Book and uploads every file once.

The job summary lists the export's and the published shelf's Book counts, what Regal assets wrote, what it published (or would have) and the Books it rebuilt. Runs never overlap: one waits for the other, and of the waiting ones only the latest runs. A step that fails fails the run (GitHub mails the owner).

A dry run: **Actions → publish-shelf → Run workflow → dry_run**: everything but the upload (`--dry-run`: the plan is printed). Locally, the same as the workflow, never `--publish` while testing:

```bash
curl -fsS -H "Authorization: Bearer $REGAL_EXPORT_TOKEN" "$LIBELLUS_EXPORT_URL" -o .data/library.json
pnpm regal-assets --in .data/library.json --no-ai --no-model --revalidate --dry-run --publish v2
```

Secrets (Settings → Secrets and variables → Actions; never in the repo):

| Secret | |
|---|---|
| `REGAL_EXPORT_TOKEN` | The shared bearer secret, the same value as the `regal-export` function secret in Libellus. |
| `LIBELLUS_EXPORT_URL` | `https://<project>.supabase.co/functions/v1/regal-export`. |
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token with R2 Object Read & Write on the bucket `portfolio-books` only. |
| `CLOUDFLARE_ACCOUNT_ID` | The account that holds the bucket. |

Optional variables: `REGAL_R2_BUCKET` (default `portfolio-books`), `REGAL_PUBLISHED_URL` (the shelf the shrink guard compares with, default `https://books.fabkho.dev/v2/library.json`). The portfolio reads `books.fabkho.dev/v2/library.json` ([#41](https://github.com/fabkho/regal/issues/41)). This replaces the owner's daily job on his Mac (Libellus `pnpm export:regal`, then `regal-assets` in a local checkout), which is retired once the workflow has run green twice. The old reading-tracker build (`books:daily`) and the `library:convert` step are retired; retiring the v1 R2 data is [#48](https://github.com/fabkho/regal/issues/48).
