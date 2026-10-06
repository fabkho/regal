# Regal as a Nuxt layer

The full reference for a host app: every setting, component, prop, token and slot. The [README](../README.md#use-regal-as-a-nuxt-layer) has the five-minute version; the [playground](https://fabkho.github.io/regal/playground) lets you try every setting below live and shows the code for it.

Regal is a [Nuxt layer](https://nuxt.com/docs/guide/going-further/layers): another Nuxt 4 app extends it and shows a Library on one of its own pages (the portfolio's `/books`, Libellus' shelf). The host gets four components and their composables, nothing else: no Regal page, no server routes, no global CSS but three `@font-face`s, no page title, no dev panel, no demo data, no playground.

- [Extend it](#extend-it) · [Config](#config-runtimeconfigpublicregal) · [Components](#components) · [Loading errors and retry](#loading-errors-and-retry) · [Preloading](#preloading) · [Theming](#theming) · [Static data](#static-data)
- [Loading it lazily](#loading-it-lazily) · [Service worker and PWA](#service-worker-and-pwa) · [CORS for the image host](#cors-for-the-image-host) · [Two hosts](#two-hosts)

## Extend it

```ts
// nuxt.config.ts of the host app
export default defineNuxtConfig({
  // From GitHub; the layer's dependencies are installed with it.
  // Pin a branch, tag or commit with a ref: 'github:fabkho/regal#main'.
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

A private fork (or a private copy of Regal) needs a token that can read it: `extends: [['github:you/regal', { install: true, auth: process.env.GIGET_AUTH }]]`, with `GIGET_AUTH` a GitHub token in the build's environment. The public repository needs none.

Regal's own components, utilities and composables import each other through the layer alias `#layers/regal/…` (the layer is named `regal`), so they resolve the same in the host; in your code, use it for Regal's non-auto-imported modules, e.g. `import('#layers/regal/app/utils/preload')`.

## Config: `runtimeConfig.public.regal`

| Key | Default | Meaning |
|---|---|---|
| `librarySrc` | `''` | URL of the [Regal library file](library-file.md) to show: absolute, or relative to the page (`/books/library.json` from the host's `public/`). Unset: the components show an error saying so. |
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

**The scroll ticks and the first swipe.** Chrome only lets a page vibrate once the user has activated it ("sticky user activation", `navigator.userActivation.hasBeenActive`): a tap, a click, a key, or a touch that ends in a real `pointerup`. A touch the browser turns into its own scroll doesn't count: it ends as a `pointercancel`. So neither the Stack nor the row scrolls natively under a finger: the Stack drives its own drag (`touch-action: none`), the row its own sideways drag (`touch-action: pan-y`, an up/down swipe still scrolls the page) with a fling along Android's own curve (`app/utils/row/touchDrag.ts`). Lifting the finger after the first swipe activates the page, and the glide after it ticks; from then on every swipe ticks while the finger moves too. Only the very first swipe's drag (before the finger lifts) stays silent, in both. Measured on Chrome 145 (Android emulator, a fresh load, one real swipe, `dumpsys vibrator_manager`): the Stack 3 vibrations, the row 1–4 (0 while it still scrolled natively). A trackpad, the wheel, the keys and the scroll bar still scroll the row natively. Taking out and putting back pulse within the tap itself, so they always can.

**Changed with the library file** ([#39](https://github.com/fabkho/regal/issues/39)): `mode` and `assetsBase` are gone. There is one way to get a Library (the file at `librarySrc`, its images listed in it), so a host that still sets them gets no error, they are ignored; drop them when you switch. `librarySrc` now names a library file, not a reading-tracker export (Libellus writes one; `pnpm library:convert` converts old published data, see [Producing a library file](producing.md)); such an export shows the error card. The Cover and description resolvers (`/api/cover`, `/api/description`, `NUXT_GOOGLE_BOOKS_API_KEY`) are no longer part of the layer.

## Components

```vue
<!-- body -->
<RegalBooksStage class="books-stage" />
<!-- the host's sidebar -->
<RegalBooksSidebar heading="Bookshelf" count-label="Books read" />
<!-- a card in another page: a profile, a year in review -->
<RegalBooksRow class="books-row" inspect="auto" :limit="80" />
<RegalBooksRow class="books-row" :year="2025" />
```

- **`RegalBooksStage`**: the 3D Stack only (no Bookcase/Stack switch), the picked Book's details card over it. On narrow stages (≤ 560 px) the details are a bottom sheet instead: it sits on the viewport's bottom edge (in `<body>`, `position: fixed`) while a Book is out, covering what the host has under the stage, at `z-index: var(--regal-sheet-z-index, 15)`: above page content, below sticky bars at 20 and up. Give it a height (it fills its box; `min-height: 24rem`). Prop `controls` (default `false`) adds the sort & filter chips over the 3D; `rotate` (`'turntable'`) how a drag turns a picked Book: `'turntable'` turns it left/right and tips it at most ~75° (as always), `'free'` spins it about both axes like a trackball and lets it glide on after a quick release (the row's default); `accessible-list` (default `true`) the [hidden Book list](#accessibility); `theme`, `unstyled` and the `#tooltip` / `#detail…` slots theme the tooltip and the detail panel ([Theming](#theming)).
- **`RegalBooksSidebar`**: the count of read Books, the Stack's sort/year/rating filters and the Books as records (hover lifts the Book in the 3D, click takes it out). Props: `heading` (`'Bookshelf'`, `''` hides it), `countLabel` (`'Books read'`), `filters` (`true`), `list` (`true`); `theme`, `unstyled` and the `#detail…` slots for the detail panel it shows while a Book is out. Fills the height it gets; the records scroll. Its filters section has the class `sidebar__filters`, so a host can hide it where `RegalBooksFilters` takes over.
- **`RegalBooksRow`**: the Library as one horizontal row for a card: the Stack turned 90°, the Books pressed together left to right (oldest first, the row starts at the newest), each month after a hairline sheet with its date above (`MAR`, the year small), the Stack's hover and, while you scroll, Books passing the middle tipping out as if pulled by the head, with the title, stars and rating (4.25) of the one in focus under it. The Book in focus is always the one in the card's middle: at rest the card is full of Books, the newest flush with its right edge (with `year`, January's first flush with its left edge; a row too short to fill the card stands centred), and the Book then in the middle is in focus; scrolling on brings the first and the last Book to the middle too (the scroll has room before the first Book and after the last, half the card). The focus label stays in one place, centred under the row (a long title is cut short with …), and the dates stay in place over their sheets, fading out while a Book is out and back in once it has landed. Dates never overlap, at any scroll position, card width or number of Books: each is measured (month, small year, count) and kept 12 px from the next. Where two months are too close, the one nearer the row's resting end keeps its date (the newest month; a `year` row's January) and the other collapses to its leader line, whatever the scroll, so nothing flickers as you scroll. A date is always whole, never cut by the card's edge: at the edge it slides in to stay inside (6 px from the side; its leader line stays on its month's first Book), and once its sheet is more than 10 px outside the card it collapses to its leader line. A neighbour a sliding date would run into steps back to its leader line until there is room again (with a few px of hysteresis). A sideways swipe scrolls the row (its own drag and fling, so the scroll ticks work from the first swipe, see Haptics), an up/down swipe the page (nothing is trapped); a trackpad, Shift+wheel, a mouse drag, the ‹ › buttons (on hover, mouse only) and the arrow keys (once focused) scroll it natively. A thin scroll bar under the Books shows where you are and how far you can still scroll (a rounded thumb as wide as the share the card shows, quiet at rest, awake while the row moves, soft fades at the card's ends); drag it or press beside it to jump. A tap or click takes a Book out, again turns it; a drag spins it freely (up/down tips it, left/right turns it, a quick release lets it glide on; in the card a finger's up/down swipe still scrolls the page), a sideways flick turns it over; the Back button, the browser's Back, Escape or a tap beside it put it back. Give it a size (it fills its box; `min-height: 18rem`; a phone card of 360 × 300 shows about 20 Books). Props:
  - `inspect` (`'card'`): where a Book taken out is looked at. `'card'` keeps it in the card (the camera steps back, the Book comes forward and grows a little; the details under it, or beside it on a wide card). `'viewport'` breaks out: the row's canvas moves into a fixed box over the whole viewport (the row stays exactly in place), the Book comes to the middle of the screen with its details as a bottom sheet (≤ 560 px wide) or a card at the bottom right, the page is veiled and does not scroll until the Book is back in the row. `'auto'`: the viewport on narrow screens (≤ 560 px), the card elsewhere. Broken out it sits at `z-index: var(--regal-row-z-index, 40)`, above the host's page and its sticky bars; it moves to `<body>`, so a CSS transform on the card's ancestors doesn't trap it.
  - `limit` (`null`): only the newest this many Books (read and being read).
  - `year` (`null`): only the Books read in that year; the row then starts at January.
  - `back-button` (`true`): Regal's Back button while a Book is out. `false` hides it (e.g. with your own close in `#detail`); Escape, the browser's/Android's Back, a tap beside the Book and the details' `close` still put it back. The `#back="{ book, close, broken }"` slot replaces it with your own markup in its place (top left of the card; broken out, of the screen).
  - `rotate` (`'free'`): how a drag turns a Book taken out: `'free'` (a trackball, both axes), or `'turntable'` (the Stage's: left/right, a little tip, only left/right for a finger in the card).
  - `intro` (`'visible'`): when the row's intro (below) plays. `'visible'`: when the row first shows, at least a third of it in the viewport (a row mounted off screen draws its Spines meanwhile and holds its Books until then); `'mount'`: as soon as its Spines are drawn, wherever it is (a host that mounts the row only once it is in view needs nothing else); `'none'`: never, the Books just show. Reduce Motion: never, whatever it says.
  - `label` (`''`): the row's accessible name (default "Books read", "Books read in 2025").
  - `accessible-list` (`true`): the [hidden Book list](#accessibility) beside the canvas (the same Books as the row: `limit`, `year`). `false` for a host that renders its own.
  - `theme`, `unstyled` and the `#tooltip` / `#detail…` slots, as on `RegalBooksStage` ([Theming](#theming)): the card, its focus label and details, also broken out.

  It has its own Pick (not shared with `RegalBooksStage` and the sidebar), so it can sit on any page beside them. Spines are drawn at the size the card shows them and a front loads only when its Book is taken out; the canvas renders only when something moves and only while the row is on screen.

  **Its intro.** A row shows nothing (just its card) until the Spines of the Books in view are drawn, so no Spine pops in afterwards. Then its Books come into place the way the Stack's pile does, turned for a row: each pops in a little to the right of its place and slides home, cascading from the left, the newest last (0.7 s). The month sheets grow with them; the dates with their leader lines, the focus label and the scroll bar stay out until the Books are home, then fade in together (0.25 s with the host's motion tokens, a 3 px rise), starting in the intro's last 0.1 s so it reads as one motion. It waits for the row to be on screen (`intro`, above: a third of the card in the viewport; the wait for the Spines, 2.5 s at most, counts from then), so a row a host mounts early, below the fold, holds its Books unseen and plays when scrolled to; until then its labels and scroll bar are held too, and the canvas draws nothing while the row is off screen. It plays once per mount, never again for new Books or a resize, and is skipped once a Book is taken out; with Reduce Motion there is none, the row simply shows, its labels at once. It waits at most 2.5 s for its Spines (from when it shows), then plays anyway. Drawn Spines are kept for the page, so the row mounted again (the page entered again) shows them on its first frame; [`preloadRegal`](#preloading) gets a row's first mount there too.
- **`RegalBooksFilters`**: the same sort & filters as one bar for a phone, to sit above `RegalBooksStage`: a line with the current choices ("Date read · Year · All years · All ratings") that opens a panel over the page. The bar is `--regal-filter-bar-height` tall (default `2.8rem`), so the host can size the stage below it in CSS; give it a `z-index` above the 3D when it is sticky. The portfolio shows it under 1025 px and hides the sidebar's filters there.

On a tall, narrow stage (a phone) the pile starts with its top Book at about 80 % of the stage's height instead of mid-view (`app/utils/stack/camera.ts`); wide stages are unchanged.

All of them load the Library from `librarySrc` themselves (server-side when possible, so the records are in the HTML; one fetch) and share it; the Stage, the Sidebar and the Filters also share the Stack's sort & filters (kept in the URL: `?sort=rating&year=2025&min=4`; `group=year|month|off` sets the date separators, default by year), the picked Book and the hovered one. They work on the same page in any layout, also when one sits in a layout and the other in the page.

The look is the decided one: re-sorts move by hand when up to 3 Books move, as a carousel above that; Books a filter brings back pop in scattered around the pile and leaving ones slide out and shrink away, and when no Book stays (a new year) the old pile sweeps out to the left before the new one settles in from the bottom up (instant with reduced motion); classic back covers; title and stars in the hover label; while you scroll the Stack (and on touch screens), Books passing the middle of the view riffle out, the centred one with that label.

**Styling.** The tooltip, the detail panel and `RegalBooksRow`'s card have their own tokens, `--regal-*` ([Theming](#theming)). The rest (the sidebar, the filters, the stage's notes) use the paper-ink tokens with fallbacks, e.g. `var(--color-ink, #2C2C2A)`, so they look right with or without them. A host that defines the same tokens (`--color-bg`, `--color-ink`, `--color-ink-muted`, `--color-ink-faint`, `--color-line`, `--color-accent`, `--color-accent-tint`, `--font-mono`, `--font-serif`, `--text-2xs` … `--text-2xl`) restyles them; set them on a wrapper to change only Regal. The `--regal-*` defaults of the light theme read them too, so a host that already maps them keeps that look. Regal registers the IBM Plex Mono, Patua One and Antonio `@font-face`s (no other global CSS).

Regal's composables (`useLibrary`, `useBookPick`, `useStackView`, `useRegalConfig` …) are auto-imported into the host too; avoid those names in the host.

## Accessibility

The Books are drawn on a canvas, which names none of them. `RegalBooksRow` and `RegalBooksStage` therefore render a visually hidden **Book list** beside it (`accessible-list`, default `true`): a `role="list"` of buttons, each reading "Title, Author, finished March 2025, 4 of 5 stars" (what a Book lacks is left out; a Book being read says "reading now"), which takes the Book out like a tap. It lists what is shown: the row's Books (`limit`, `year`), the Stack's filtered and sorted ones. The whole list is one Tab stop; the arrow keys, Home and End move inside it, and the button in focus shows itself (a small label over the corner) so sighted keyboard users see where they are. In the row, focusing a button also brings its Book to the middle. A host that renders its own list (Libellus' `ShelfBookList`) sets `:accessible-list="false"`.

A Book taken out is a real dialog: the details card or sheet has `role="dialog"`, is labelled by the title (or `"{title} details"` when the host's `#detail` / `#detail-header` replaces it), takes focus when it opens, and gives it back to the button (or the row's scroller) that opened it when the Book is put away; Escape, Back and the browser's Back put it away. On `RegalBooksRow` it is modal when the row breaks out (`aria-modal="true"`, Tab stays in the dialog and Back, the canvas box in `<body>` is `aria-hidden` while it is open); in the card, and on `RegalBooksStage` (the Stack behind it stays in use), it is a non-modal dialog. It is a `div` (it was an `article`).

The row's scroller is a `role="region"` named "N books, scroll sideways". Stars are drawn only (`aria-hidden`) and said as text, "4.25 of 5 stars", in the tooltip, the focus label, the details and the records.

## Loading errors and retry

A library file that can't be shown (offline, a 5xx, CORS, bad JSON, an invalid file) gives `RegalBooksStage` and `RegalBooksRow` an error card: why, the file's URL and the first problems, and a **Try again** button (the sidebar's one-line error has none: the Stage's card has it). The button is styled with the same tokens as the card's other controls (`--regal-accent`, `--regal-radius-control` …) and with `unstyled` only its place and text remain (a plain underlined button; `.file-error__retry`).

**A failure is never kept as final.**

- The next mount of a Regal component, or the next `preloadRegal()`, fetches the file again. A host that mounts the row again to retry (a `v-if`, a `:key`, a route change) needs nothing else.
- A file that loaded and is valid stays for the page: remounts make no request.
- A rejected, non-OK, non-JSON or invalid read is dropped as soon as it settles; requests in flight are shared (concurrent mounts, retries and a running `preloadRegal()` make one request).

**`useRegalLibrary().retry()`** for a host's own button, in any component:

```ts
const { books, error, loading, retry } = useRegalLibrary()   // src optional, as for the components
await retry()   // fetches the file again after a failure; resolves once the result is shown
```

| | |
|---|---|
| `retry(): Promise<void>` | After a failure: asks for the file again and shows the result (the Library, or the new error). A request already on its way is joined, never doubled. Does nothing while the Library is shown. |
| `loading: Ref<boolean>` | A request for the file is on its way (browser only): disable the button. |
| `error`, `books`, `source` … | The shared Library (the same refs as `useLibrary()`). |

`useRegalLibrary()` also loads the file on mount, like the components (shared, one request); call it where a component of Regal is, or in a host component next to it. It does not need `useState('regal:library-loaded')` or any other of Regal's keys, which a host should not touch.

## Preloading

A `RegalBooksRow` that mounts cold waits for the row's code (three.js, TresJS and Regal: ~230 KB brotli), the library file (fetched only once the row has mounted), the Spine images and fonts, and drawing the Spines. `preloadRegal()` does all of it ahead, while the owner is still on another screen, so the row shows its Spines on its first frame and goes straight into its intro:

```ts
// Where the row is likely next (the Home or app start of the signed-in owner), on idle:
requestIdleCallback(async () => {
  const { preloadRegal } = await import('#layers/regal/app/utils/preload')
  await preloadRegal({ limit: 80 })            // the row's own `limit` / `year`
})
```

- **What it does.** Fetches and reads the library file into the page's cache (the row reads it there and shows the Library in its first render, no second fetch); fetches the row's code (`import()` of `RegalBooksRow`); draws the Spines and page edges of the Books the row opens on (the newest, a `year` row's January; as many as the card shows) into the page's face cache, exactly as the row would draw them. Only Spines whose colours the library file gives (`palette`, as Regal assets writes) are drawn ahead; others the row draws itself.
- **Options.** `src` (default `librarySrc`; pass it when calling outside the app's context with a page-specific source), `limit` and `year` (the row's), `spines` (`'visible'`, a number from where the row opens, or `false`), `width` / `height` (the card's CSS px; default the viewport's width × 288, for which Books show and the Spines' resolution), `chunk` (`true`: `RegalBooksRow`'s chunk; a function: your own import, e.g. of the component that wraps the row, when it brings Regal's fonts with it; `false`: none).
- **Safe anywhere.** It resolves when done and never rejects (whatever didn't warm, the row loads as before); a failed warm-up (offline, a 5xx, a file that isn't valid) is dropped, not kept, and tried again on the next call. Calls with the same options share one warm-up; everything is kept for the page (module level) and reused by every row and by a row mounted again. It does nothing on the server and needs no row on the page.
- **Where to call it.** As soon as the owner's row is a likely next step: on the screen before it, on idle (`requestIdleCallback`), or when its link comes into view. A dynamic `import()` keeps it out of the host's entry, and when the host bundles Regal into one chunk (a `codeSplitting` group), that import already fetches the chunk. The Spines are drawn only once the Spine fonts (Patua One, Antonio) are registered; a host that moves Regal's `@font-face` rules into its own chunk passes `chunk: () => import('~/components/MyRow.vue')`.

The row marks its first look in the browser's performance timeline (`regal:library:shown`, `regal:row:first-frame`, `regal:row:spines-ready`, `regal:row:intro-start`, `regal:preload:done` …), for a host's own profiling. On a phone profile (4× CPU, Fast 4G; a production host that loads the row like Libellus), from the tap to the first frame with every Spine in view: 2.25 s before the row's first look was reworked, 1.24 s cold now, 0.27 s with `preloadRegal` on the screen before (the first frame drawn is full), 0.15 s for a row mounted again. The intro's 0.7 s follow.

## Theming

`RegalBooksStage` and `RegalBooksRow` take the host's look the same way, with the same tokens, the same `theme` prop, the same slots and `unstyled` (`RegalBooksSidebar`: `theme`, `unstyled` and the detail slots, for the panel it shows while a Book is out). Regal's DOM around the 3D is themed:

- `RegalBooksStage`: the **tooltip** (the hover label, the Stack's scroll focus label, the morph box between label and card) and the **Book detail panel** (the card, the bottom sheet on phones).
- `RegalBooksRow`: the card itself (its surface and frame, the month/year labels with their leader lines, the scroll indicator, the ‹ › and Back buttons), its **tooltip** (the focus label: title and stars under the Book in focus) and its **detail panel** (the details under or beside the Book in the card; broken out, `inspect="viewport"`, the phone's sheet or the card at the bottom right). The veil behind a Book taken out is the card's surface colour: paper by default, dark in the dark theme, the host's `--regal-surface` when set; `--regal-veil-color` and `--regal-veil-opacity` (solid: `1`) set it directly (see "The row's card and sheet"). `RegalBooksStage` has no veil (the Stack is not dimmed behind a picked Book), so these tokens only reach the row.

Three ways, from light to full control. Regal always keeps placing them, opening and closing (click, Escape, the sheet's drag, the host's Back via `putAway`; Back and a tap beside the Book in the row), the label ↔ card morph, the row's break-out and the swap between Books. The 3D (Books, lights, the row's hairline sheets) is not themed, but for the Books' shadow on the floor (`--regal-floor-shadow`: Regal's warm brown in the light theme, none in the dark one, where it would read as a lit block).

**1. Tokens.** Every colour, frame, type and spacing value of these parts is a CSS custom property. Set them anywhere above Regal: on `:root`, on your theme's `[data-theme="dark"]` rule, or on the class you give the component. Parts that live in `<body>` (the hover label, the morph box, the phone's sheet; a broken-out row's canvas box with its labels, Back and the details) get the values the component resolved, so a token on the wrapper reaches them too. Unset ones fall back to the theme's defaults. Regal's own values live on a `.regal` scope (the component's root and each surface), never on `:root`. One table for both components (– : not used there); the row keeps its own smaller type and paddings, so a few tokens only reach it once set (the table says so):

| Token | Light default | Dark default | `RegalBooksStage` | `RegalBooksRow` |
|---|---|---|---|---|
| `--regal-surface` | `var(--color-bg, #F5F2EB)` | `#1F1E1B` | Tooltip background | The card, the focus label, ‹ › and Back; the veil behind a Book taken out |
| `--regal-surface-raised` | `--regal-surface` | `#262420` | Detail panel background; button text on hover | The details |
| `--regal-ink` | `var(--color-ink, #2C2C2A)` | `#ECE8DF` | Text; button background on hover | Text, the month/year labels and their leader lines, the scroll indicator |
| `--regal-ink-muted` | `var(--color-ink-muted, #6B6B69)` | `#A8A399` | Meta line, labels, the rating's number (also in the tooltip) | The line under the title, the hint, the rating's number in the focus label |
| `--regal-ink-subtle` | `var(--color-ink-subtle, rgba(44, 44, 42, 0.72))` | `rgba(236, 232, 223, 0.75)` | Button text | – |
| `--regal-ink-faint` | `var(--color-ink-faint, rgba(44, 44, 42, 0.55))` | `rgba(236, 232, 223, 0.5)` | The sheet's grip | "No books to show" |
| `--regal-accent` | `var(--color-accent, #B93E2E)` | `#E0705F` | Stars, links | Stars, the month's count, "Turn over", ‹ › and Back on hover, the focus ring |
| `--regal-accent-hover` | `var(--color-accent-light, #E8665A)` | `#F0907F` | Links on hover | – |
| `--regal-hairline` | `var(--color-line, rgba(44, 44, 42, 0.14))` | `rgba(236, 232, 223, 0.16)` | Empty stars, the review's rule | Empty stars, the scroll track |
| `--regal-border` | `var(--color-ink, #2C2C2A)` | `rgba(236, 232, 223, 0.28)` | Frame of the tooltip, the panel and its buttons | Frame of the card, the focus label, the details and the buttons |
| `--regal-border-width` | `1px` | | `0` for frameless surfaces | The same frames |
| `--regal-radius` | `0` | | Corner radius of the tooltip and the panel | Corners of the card, the focus label and the broken-out details (the sheet's top ones) |
| `--regal-radius-control` | `0` | | Corner radius of the panel's buttons | Corners of ‹ › and Back |
| `--regal-shadow` | `none` | `0 10px 30px rgba(0, 0, 0, 0.45)` | `box-shadow` of the panel (and of the tooltip's labels unless `--regal-label-shadow` is set) | The broken-out details (and the focus label unless `--regal-label-shadow` is set) |
| `--regal-label-shadow` | `var(--regal-shadow)` | | `box-shadow` of the hover and focus labels (the tooltip's pills); `none` keeps them flat over a host's raised shadow | The focus label (title and stars over the scroll bar) |
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
| `--regal-floor-shadow` | `1` | `0` | How strongly the Books' shadow prints on the floor of the Stack and the Bookcase: `0` none, `1` Regal's, up to `2`; follows the theme live (`unstyled` keeps it) | The same under the row |

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
| `#tooltip` | `{ book }` | Title, stars and the rating's number in the hover and scroll focus labels | Title, stars and the rating's number in the focus label under the Book in focus |
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
| `--regal-veil-opacity` | `0.9` | The veil behind a Book taken out while it is broken out (`inspect="viewport"`), over the whole viewport: `0` to `1`; `1` is solid, nothing of the page or a bottom sheet shows through. It fades in and out with the Book as before |
| `--regal-veil-opacity-card` | `0.72` | The same veil while the Book stays in the card (`inspect="card"`) |
| `--regal-veil-color` | the card's surface | The veil's colour: any CSS colour (`#fff`, `oklch(…)`); unset (or not a colour), `--regal-surface`, i.e. the card's background |
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

## Static data

Regal reads one file: the [Regal library file](library-file.md) (`version: 2`), every Book with its data and resolved assets (front, Spine and back images, small pile copies, Spine colours, blurb), validated when it loads. Put it anywhere (the host's `public/`, a CDN) and point `librarySrc` at it.

- Image references in it are absolute or relative to the file's own URL (`9780756413026/front.webp` next to the file). Images on another origin must allow CORS, as they become WebGL textures.
- A Book without an image gets the drawn one: a placeholder front, a typeset Spine and back.
- A file that doesn't load or isn't valid (another `version`, a reading-tracker export, a broken field) shows an error card with the first problems (`books[3].rating: must be …`), never an empty shelf.
- The Stack loads lazily from the file's `pile` copies: the Spines in and around the view first, then the rest of the pile in the background, and a Book's full front and back only once it is pointed at or taken out. Without `pile` copies the full faces stand in; without `palette` the Spine colours are sampled from the front in the browser.

`nuxt dev` note: a `public/books/` folder next to a `/books` page makes the dev server redirect `/books` to `/books/` (the page still renders). Production builds don't.

`tests/fixtures/layer-host/` is a minimal host (a synthetic library file) built by `tests/e2e/layer-host.test.ts`; `pnpm nuxi dev tests/fixtures/layer-host` runs it.

## Loading it lazily

Regal's code is three.js, TresJS, GSAP and the layer: about 1 MB of JavaScript, 230 KB brotli. Keep it off the pages that don't show it, and out of the app's entry:

- **Only the shelf's page imports it.** Nuxt splits per page, so a `/books` page that uses `RegalBooksStage` already keeps Regal out of the other pages. A component on a shared page (a profile card with `RegalBooksRow`) should be loaded lazily: wrap Regal in a component of your own and use it as `<LazyMyShelf />` (Nuxt's `Lazy` prefix), or `defineAsyncComponent(() => import(…))`. Libellus does this for its stage and row (`LazyShelfStage`, `LazyShelfRow`).
- **One chunk, by name.** A bundler group keeps three.js, TresJS and Regal together in one named chunk, which a service worker can then leave out of its precache (below). Libellus' Vite/Rolldown config: `build.rolldownOptions.output.codeSplitting.groups: [{ name: 'regal', test: isRegalModule, includeDependenciesRecursively: false }]`, with `isRegalModule` matching three.js and its renderers, `@tresjs`, `gsap` and the layer's own folder ([`web/regal.config.ts`](https://github.com/fabkho/libellus/blob/main/web/regal.config.ts) in Libellus, which also fails its build when the app's entry ever imports that chunk).
- **The fonts.** `@nuxt/fonts` puts Regal's `@font-face` rules (IBM Plex Mono, Patua One, Antonio) in the entry stylesheet. A host that wants them in the Regal chunk instead removes `#build/nuxt-fonts-global.css` from `nuxt.options.css` and imports it in the component that wraps Regal (Libellus does), and passes that import to `preloadRegal({ chunk: () => import(…) })`.
- **The bookcase model.** Regal's `public/models/bookcase.glb` (295 KB) is merged into the host's public folder like any layer's `public/`. The embed components are Stack-only and never load it; a host can drop it from its output with a `nitro:config` hook that filters Regal's `public` out of `publicAssets` (Libellus does).
- **Warm it up.** [`preloadRegal()`](#preloading) fetches the chunk, the library file and draws the first Spines on idle, before the visitor opens the shelf.
- **Rendering.** The components load the library file during server rendering when they can (the records are in the HTML) and in the browser otherwise. A page whose library file changes daily should be rendered per request, not prerendered (the portfolio sets `routeRules: { '/books': { prerender: false } }`); an SPA (`ssr: false`, Libellus) simply loads it in the browser.

## Service worker and PWA

A PWA that precaches its whole build would download Regal (the chunk, its fonts, the model) on install for every visitor. Leave it out of the precache and cache it at runtime once the shelf is opened. With `@vite-pwa/nuxt` (Workbox), as Libellus does:

```ts
// nuxt.config.ts (with the `regal` chunk named as above)
pwa: {
  workbox: {
    globIgnores: ['**/regal.*.js', '**/regal.*.css', '_fonts/**', 'models/**'],
    runtimeCaching: [
      {
        // The chunk, its stylesheet and the fonts, as the shelf asks for them; their names carry a hash.
        urlPattern: ({ url }) => /^\/(_nuxt\/regal\.[^/]+\.(js|css)|_fonts\/[^/]+)$/.test(url.pathname),
        handler: 'CacheFirst',
        options: { cacheName: 'shelf-code', expiration: { maxEntries: 60 } },
      },
      {
        // The library file: the newest online, the last one seen offline.
        urlPattern: ({ url }) => url.href === 'https://books.example.com/library.json',
        handler: 'NetworkFirst',
        options: { cacheName: 'shelf-library', networkTimeoutSeconds: 6, expiration: { maxEntries: 2 } },
      },
      {
        // Its images, read with CORS as WebGL textures; a published image keeps its address.
        urlPattern: ({ url, request }) => url.origin === 'https://books.example.com' && request.destination !== 'document',
        handler: 'CacheFirst',
        options: { cacheName: 'shelf-images', expiration: { maxEntries: 500, purgeOnQuotaError: true } },
      },
    ],
  },
},
```

Workbox copies each `urlPattern` into the service worker as source text: write the addresses out, don't reference variables from your config. Images must be fetched with CORS (Regal does), so never answer them from an opaque (`no-cors`) cache entry.

## CORS for the image host

The images of a library file become WebGL textures, and WebGL refuses images it can't read: every image on another origin than the page must be served with `Access-Control-Allow-Origin` for the page's origin. So must the library file itself when it lives on another origin. Without it the Books fall back to drawn faces (and a library file shows the error card).

- **Same origin** (the file and its images in the host's `public/`, or behind the same domain): nothing to do.
- **A CDN or bucket**: allow every origin that shows the shelf, including preview and local dev origins. For Cloudflare R2: the bucket's **Settings → CORS policy**, e.g.

  ```json
  [{ "AllowedOrigins": ["https://example.com", "http://localhost:3000"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 86400 }]
  ```

- **Check it**: `curl -sI -H "Origin: https://example.com" https://books.example.com/library.json | grep -i access-control` must print `access-control-allow-origin: https://example.com` (or `*`). The same for an image.

The owner's shelf (`books.fabkho.dev`) allows `https://fabkho.dev` and Libellus' origins, not others: that is why `?src=https://books.fabkho.dev/v2/library.json` doesn't work from another site, and why Regal's own dev server proxies it.

## Two hosts

- **fabkho.dev/books** (the portfolio): `RegalBooksStage` and `RegalBooksSidebar` side by side on a `/books` page, `RegalBooksFilters` above the stage under 1025 px (the sidebar's filters hidden there with `.sidebar__filters`). `librarySrc: 'https://books.fabkho.dev/v2/library.json'`, the file the [daily chain](producing.md#the-daily-chain) publishes to R2; the page is rendered per request.
- **Libellus** (a Nuxt SPA and PWA): the owner's shelf in its profile (`RegalBooksStage` with `theme="auto"` and its own tokens, mapped from its design tokens in one stylesheet) and a `RegalBooksRow` in each year in review (`inspect="viewport"`, `:year`, `:back-button="false"`, its own `#detail` sheet; the example under [Theming](#theming)). Everything Regal is lazy, in one chunk outside the precache, warmed with `preloadRegal` for the signed-in owner; see its [`regal.config.ts`](https://github.com/fabkho/libellus/blob/main/web/regal.config.ts).
