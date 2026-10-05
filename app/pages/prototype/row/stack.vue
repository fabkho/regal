<script setup lang="ts">
// Design round 2, dev only: the horizontal Stack (variant a, polished): the
// vertical Stack turned 90°, at card size with the picked Book kept in the
// card or breaking out into the viewport, side by side. ?hover=stack|tip
// ?riffle=stack|tip ?n= ?year= ?src=demo ?hud. Not shipped (nuxt.config.ts).
import { useRowLibrary } from '#layers/regal/app/prototype/row/useRowLibrary'

const route = useRoute()
const { books, error, loading, count, year, source } = useRowLibrary()
const hoverLook = computed(() => (route.query.hover === 'tip' ? 'tip' : 'stack'))
const riffleLook = computed(() => (route.query.riffle === 'tip' ? 'tip' : 'stack'))
const hud = computed(() => route.query.hud !== undefined)
/** A year reads from January; the whole shelf starts at what was read last, as the Stack does. */
const start = computed(() => (year.value ? 'first' : 'last'))
const title = computed(() => (year.value ? `Read in ${year.value}` : `${books.value.length} books read`))
const query = (patch: Record<string, string | number | undefined>) => ({ query: { ...route.query, ...patch } })

useHead({ title: 'Horizontal Stack — Regal prototype' })
</script>

<template>
  <div class="hs">
    <nav class="hs__nav">
      <NuxtLink :to="{ path: '/prototype/row', query: route.query }">
        ← Round 1: a · b · c
      </NuxtLink>
    </nav>

    <header class="hs__head">
      <p class="hs__kicker">
        Regal · design round 2 · dev only
      </p>
      <h1>The horizontal Stack</h1>
      <p>
        Today's Stack turned 90° clockwise: the pile's bottom on the left, what was read last on the right, where the row starts.
        Books pressed together without a gap; each month after the Stack's hairline sheet, its date above the row with the
        Stack's leader line. The Stack's hover (towards you, a little turned, the glint) and its riffle: Books passing the middle
        fan out while you scroll, the one in focus with its title and stars. Turned for a row: the Books stand on one line
        instead of the Stack's sideways offsets.
      </p>
      <p class="hs__controls">
        Books:
        <NuxtLink
          :to="query({ n: undefined, year: undefined })"
          :aria-current="count === null && !year ? 'true' : undefined"
        >all</NuxtLink>
        <NuxtLink
          v-for="n in [5, 30, 50, 100]"
          :key="n"
          :to="query({ n, year: undefined })"
          :aria-current="count === n && !year ? 'true' : undefined"
        >{{ n }}</NuxtLink>
        <NuxtLink
          :to="query({ year: 2025, n: undefined })"
          :aria-current="year === 2025 ? 'true' : undefined"
        >year 2025</NuxtLink>
        · Library:
        <NuxtLink
          :to="query({ src: undefined })"
          :aria-current="source === 'published' ? 'true' : undefined"
        >published</NuxtLink>
        <NuxtLink
          :to="query({ src: 'demo' })"
          :aria-current="source === 'demo' ? 'true' : undefined"
        >demo</NuxtLink>
      </p>
      <p class="hs__controls">
        Hover:
        <NuxtLink
          :to="query({ hover: undefined })"
          :aria-current="hoverLook === 'stack' ? 'true' : undefined"
        >the Stack's, turned</NuxtLink>
        <NuxtLink
          :to="query({ hover: 'tip' })"
          :aria-current="hoverLook === 'tip' ? 'true' : undefined"
        >tips out (round 1)</NuxtLink>
        · Riffle while scrolling:
        <NuxtLink
          :to="query({ riffle: undefined })"
          :aria-current="riffleLook === 'stack' ? 'true' : undefined"
        >the Stack's, turned (bottoms swing out)</NuxtLink>
        <NuxtLink
          :to="query({ riffle: 'tip' })"
          :aria-current="riffleLook === 'tip' ? 'true' : undefined"
        >tops tip out</NuxtLink>
      </p>
      <p
        v-if="error"
        class="hs__error"
      >
        {{ error }}
      </p>
    </header>

    <template v-if="!loading && books.length">
      <section class="hs__section">
        <h2>Phone card · 360 × 300</h2>
        <div class="hs__pair">
          <figure>
            <figcaption><b>Keeps the card.</b> The camera steps back from the row; the Book comes forward and grows a little, the details under it.</figcaption>
            <PrototypeRowCard
              class="hs__card hs__card--small"
              variant="s"
              :books="books"
              order="chrono"
              :start="start"
              :title="title"
              :hud="hud"
              inspect="card"
              :hover-look="hoverLook"
              :riffle-look="riffleLook"
            />
          </figure>
          <figure>
            <figcaption><b>Breaks out.</b> The Book leaves the card for the middle of the screen, the details in a sheet; Back lands it in the card again.</figcaption>
            <PrototypeRowCard
              class="hs__card hs__card--small"
              variant="s"
              :books="books"
              order="chrono"
              :start="start"
              :title="title"
              :hud="hud"
              inspect="viewport"
              :hover-look="hoverLook"
              :riffle-look="riffleLook"
            />
          </figure>
        </div>
      </section>

      <p class="hs__filler">
        Page content between the cards: a vertical swipe over a row scrolls the page, a sideways one the row.
      </p>

      <section class="hs__section">
        <h2>Wide card · 720 × 320</h2>
        <div class="hs__stack">
          <figure>
            <figcaption><b>Keeps the card.</b> Details beside the Book.</figcaption>
            <PrototypeRowCard
              class="hs__card hs__card--wide"
              variant="s"
              :books="books"
              order="chrono"
              :start="start"
              :title="title"
              :hud="hud"
              inspect="card"
              :hover-look="hoverLook"
              :riffle-look="riffleLook"
            />
          </figure>
          <figure>
            <figcaption><b>Breaks out.</b> The Book comes to the middle of the screen, the details as the Stack's card, bottom right.</figcaption>
            <PrototypeRowCard
              class="hs__card hs__card--wide"
              variant="s"
              :books="books"
              order="chrono"
              :start="start"
              :title="title"
              :hud="hud"
              inspect="viewport"
              :hover-look="hoverLook"
              :riffle-look="riffleLook"
            />
          </figure>
        </div>
      </section>

      <section class="hs__section">
        <h2>Full width · breaks out on a phone, keeps the card elsewhere (auto)</h2>
        <PrototypeRowCard
          class="hs__card hs__card--full"
          variant="s"
          :books="books"
          order="chrono"
          :start="start"
          :title="title"
          :hud="hud"
          inspect="auto"
          :hover-look="hoverLook"
          :riffle-look="riffleLook"
        />
      </section>

      <section class="hs__notes">
        <h2>Keep the card or break out?</h2>
        <p>
          <b>Keeping the card</b> leaves the page as it is: no scroll lock, nothing over the host's own bars, the card stays a self-contained
          widget in any layout. The cost is size: in a 300 px card the Book is at most ~200 px tall, the details two or three lines, no blurb
          or review. Fine on a wide card (the details go beside the Book, with room for both), cramped on a phone.
        </p>
        <p>
          <b>Breaking out</b> gives the Book the screen: it comes to the middle as large as in the Stack (about half the viewport's height),
          the details are the same sheet RegalBooksStage shows on phones (blurb, review), and the row stays visible under the veil, so the
          way back is obvious. Seamless here because the canvas only moves into a full-viewport box with the camera keeping the card's
          view (the same pixels where the card is), so the Book lifts out of the row and lands back in it, no second canvas, no texture
          copy. The costs: the page can't scroll while a Book is out (it is a modal moment), a fixed layer the host must leave room for
          (z-index, like the sheet's <code>--regal-sheet-z-index</code>), a full-screen canvas while it is open (on demand: only while
          something moves), and it must not live under a CSS transform (Teleport to body avoids that).
        </p>
        <p>
          <b>Suggestion:</b> <code>inspect="auto"</code> as the default: break out on narrow screens (≤ 560 px, where RegalBooksStage
          already switches to its sheet), keep the card on wide ones, where the card has room and a modal would feel heavier than the
          content. A host can force either.
        </p>
      </section>

      <p class="hs__filler hs__filler--tail">
        More page below, so the cards can be scrolled away and back.
      </p>
    </template>
    <p
      v-else-if="loading"
      class="hs__filler"
    >
      Loading…
    </p>
  </div>
</template>

<style scoped>
.hs {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem 1rem 50vh;
}

.hs__nav {
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hs__kicker {
  margin: 1rem 0 0;
  color: var(--color-ink-muted);
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hs__head h1 {
  margin: 0.3rem 0 0.5rem;
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 400;
  font-size: var(--text-2xl);
}

.hs__head p {
  max-width: 52rem;
  margin: 0.4rem 0;
  color: var(--color-ink-muted);
}

.hs__controls a {
  margin: 0 0.25rem;
}

.hs__controls [aria-current] {
  color: var(--color-ink);
  text-decoration: underline;
}

.hs__error {
  color: var(--color-accent) !important;
}

.hs__section {
  margin-top: 2rem;
}

.hs__section h2,
.hs__notes h2 {
  margin: 0 0 0.6rem;
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hs__pair {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.hs__stack {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.5rem;
}

figure {
  min-width: 0;
  max-width: 100%;
  margin: 0;
}

figcaption {
  max-width: 360px;
  margin-bottom: 0.5rem;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.hs__stack figcaption {
  max-width: 720px;
}

figcaption b {
  color: var(--color-ink);
  font-weight: 600;
}

.hs__card {
  max-width: 100%;
}

.hs__card--small {
  width: 360px;
  height: 300px;
}

.hs__card--wide {
  width: 720px;
  height: 320px;
}

.hs__card--full {
  width: 100%;
  height: clamp(320px, 42vh, 440px);
}

.hs__notes {
  max-width: 52rem;
  margin-top: 2.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-ink);
}

.hs__notes p {
  margin: 0 0 0.7rem;
}

.hs__filler {
  max-width: 40rem;
  margin: 1.5rem 0 0;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.hs__filler--tail {
  margin-top: 2.5rem;
}
</style>
