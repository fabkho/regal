<script setup lang="ts">
// Regal's own site: RegalBooksRow, the Library as one row for a card, at a
// phone card's size and a wide one, keeping a picked Book in the card or
// breaking out. Shows `librarySrc` (the demo) or `?src=<url>`; `?year=` and
// `?limit=` go to the rows. Hosts don't get this page (nuxt.config.ts).
const route = useRoute()
const visitorSrc = computed(() => {
  const value = route.query.src
  return typeof value === 'string' && value.trim() ? value.trim() : null
})
useRegalLibrary(visitorSrc, { server: !visitorSrc.value })

const number = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}
const year = computed(() => number(route.query.year))
const limit = computed(() => number(route.query.limit))

useHead({ title: 'Regal — the row' })
</script>

<template>
  <div class="row-page">
    <header class="row-page__header">
      <NuxtLink
        :to="{ path: '/', query: visitorSrc ? { src: visitorSrc } : {} }"
        class="row-page__back"
      >
        ← Regal
      </NuxtLink>
      <h1 class="row-page__title">
        The row
      </h1>
      <p class="row-page__tagline">
        The Stack turned on its side, for a card. Swipe or drag it sideways, take a Book out.
      </p>
    </header>

    <main class="row-page__main">
      <section class="row-page__pair">
        <figure>
          <figcaption><code>inspect="card"</code> keeps a picked Book in the card.</figcaption>
          <RegalBooksRow
            class="row-page__card row-page__card--small"
            inspect="card"
            :year="year"
            :limit="limit"
          />
        </figure>
        <figure>
          <figcaption><code>inspect="viewport"</code> breaks out: the Book comes to the middle of the screen.</figcaption>
          <RegalBooksRow
            class="row-page__card row-page__card--small"
            inspect="viewport"
            :year="year"
            :limit="limit"
          />
        </figure>
      </section>

      <section>
        <figure>
          <figcaption><code>inspect="auto"</code>, wide: breaks out on a phone, keeps the card elsewhere.</figcaption>
          <RegalBooksRow
            class="row-page__card row-page__card--wide"
            inspect="auto"
            :year="year"
            :limit="limit"
          />
        </figure>
      </section>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.row-page {
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr auto;
}

.row-page__header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem 1rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--color-ink);
}

.row-page__back {
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.row-page__title {
  margin: 0;
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 400;
  font-size: var(--text-2xl);
}

.row-page__tagline {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.row-page__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2rem;
  align-content: start;
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
  padding: 1.5rem;
}

.row-page__pair {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
}

figure {
  min-width: 0;
  max-width: 100%;
  margin: 0;
}

figcaption {
  margin-bottom: 0.5rem;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.row-page__card {
  max-width: 100%;
}

.row-page__card--small {
  width: 360px;
  height: 300px;
}

.row-page__card--wide {
  width: 720px;
  height: 320px;
}
</style>
