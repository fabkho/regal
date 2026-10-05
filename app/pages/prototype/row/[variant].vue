<script setup lang="ts">
// Design round (horizontal Stack), dev only: one prototype row at card size
// (360 × 300 and 720 × 320, as Libellus' year in review and Profile would
// embed it) and full width, between paragraphs so vertical page scrolling
// can be tried over it. ?src=published|demo ?n=5|30|50|100 ?order=newest|chrono
// ?year=2025 ?only=small|wide|full ?hud=1. Not shipped (nuxt.config.ts).
import { ROW_VARIANTS } from '#layers/regal/app/prototype/row/layout'
import type { RowVariantKey } from '#layers/regal/app/prototype/row/layout'
import { useRowLibrary } from '#layers/regal/app/prototype/row/useRowLibrary'

const route = useRoute()
const key = computed<RowVariantKey>(() => (['a', 'b', 'c'].includes(String(route.params.variant)) ? String(route.params.variant) as RowVariantKey : 'a'))
const variant = computed(() => ROW_VARIANTS[key.value])
const { books, error, loading, source, count, year, order } = useRowLibrary()
const only = computed(() => String(route.query.only ?? ''))
const hud = computed(() => route.query.hud !== undefined)
/** ?bare: only the cards (screenshots, videos). */
const bare = computed(() => route.query.bare !== undefined)
const shows = (size: string) => !only.value || only.value === size
const title = computed(() => (year.value ? `Read in ${year.value}` : `${books.value.length} books read`))

useHead({ title: () => `Row ${key.value}: ${variant.value.name} — Regal prototype` })

const query = (patch: Record<string, string | number | undefined>) => ({ query: { ...route.query, ...patch } })
</script>

<template>
  <div
    class="proto"
    :class="{ 'proto--bare': bare }"
  >
    <nav class="proto__nav">
      <NuxtLink :to="{ path: '/prototype/row', query: route.query }">
        ← Compare
      </NuxtLink>
      <NuxtLink
        v-for="other in ['a', 'b', 'c']"
        :key="other"
        :to="{ path: `/prototype/row/${other}`, query: route.query }"
        :aria-current="other === key ? 'page' : undefined"
      >
        {{ other }} · {{ ROW_VARIANTS[other as RowVariantKey].name }}
      </NuxtLink>
    </nav>

    <header class="proto__head">
      <h1>{{ key }} · {{ variant.name }}</h1>
      <p>{{ variant.blurb }}</p>
      <p class="proto__controls">
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
        >2025</NuxtLink>
        · Library:
        <NuxtLink
          :to="query({ src: undefined })"
          :aria-current="source === 'published' ? 'true' : undefined"
        >published (AI art)</NuxtLink>
        <NuxtLink
          :to="query({ src: 'demo' })"
          :aria-current="source === 'demo' ? 'true' : undefined"
        >demo</NuxtLink>
        · Order:
        <NuxtLink
          :to="query({ order: undefined })"
          :aria-current="order === 'newest' ? 'true' : undefined"
        >newest first</NuxtLink>
        <NuxtLink
          :to="query({ order: 'chrono' })"
          :aria-current="order === 'chrono' ? 'true' : undefined"
        >Jan → Dec</NuxtLink>
      </p>
      <p
        v-if="error"
        class="proto__error"
      >
        {{ error }}
      </p>
    </header>

    <template v-if="!loading && books.length">
      <section
        v-if="shows('small')"
        class="proto__section"
      >
        <h2>Card · 360 × 300 (phone, year in review)</h2>
        <p class="proto__filler">
          Swipe the row sideways; swipe up or down over it and the page scrolls. Tap a Book to take it out, tap it again to turn it, Back puts it away.
        </p>
        <PrototypeRowCard
          class="proto__card proto__card--small"
          :variant="key"
          :books="books"
          :order="order"
          :title="title"
          :hud="hud"
        />
      </section>

      <section
        v-if="shows('wide')"
        class="proto__section"
      >
        <h2>Card · 720 × 320 (Profile)</h2>
        <p class="proto__filler">
          A wide card puts the details beside the Book. Mouse: drag the row, Shift+wheel or a trackpad scrolls it, the arrows step it. Keyboard: focus the row, arrows scroll, Enter takes the Book in focus out, Escape puts it back.
        </p>
        <PrototypeRowCard
          class="proto__card proto__card--wide"
          :variant="key"
          :books="books"
          :order="order"
          :title="title"
          :hud="hud"
        />
      </section>

      <section
        v-if="shows('full')"
        class="proto__section proto__section--full"
      >
        <h2>Full width</h2>
        <PrototypeRowCard
          class="proto__card proto__card--full"
          :variant="key"
          :books="books"
          :order="order"
          :title="title"
          :hud="hud"
        />
      </section>

      <p
        v-if="!only"
        class="proto__filler proto__filler--tail"
      >
        Page content goes on below the cards, so a vertical swipe over a row must still scroll the page.
      </p>
    </template>
    <p
      v-else-if="loading"
      class="proto__filler"
    >
      Loading…
    </p>
  </div>
</template>

<style scoped>
.proto {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem 1rem 40vh;
}

.proto--bare {
  max-width: none;
  padding: 16px;
}

.proto--bare .proto__nav,
.proto--bare .proto__head,
.proto--bare h2,
.proto--bare .proto__filler {
  display: none;
}

.proto--bare .proto__section {
  margin: 0;
}

.proto__nav {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.proto__nav [aria-current],
.proto__controls [aria-current] {
  color: var(--color-ink);
  text-decoration: underline;
}

.proto__head h1 {
  margin: 1rem 0 0.25rem;
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 400;
  font-size: var(--text-2xl);
}

.proto__head p {
  max-width: 46rem;
  margin: 0.3rem 0;
  color: var(--color-ink-muted);
}

.proto__controls a {
  margin: 0 0.25rem;
}

.proto__error {
  color: var(--color-accent) !important;
}

.proto__section {
  margin-top: 2rem;
}

.proto__section h2 {
  margin: 0 0 0.3rem;
  font-size: var(--text-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.proto__filler {
  max-width: 40rem;
  margin: 0 0 0.8rem;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.proto__filler--tail {
  margin-top: 2rem;
}

.proto__card {
  max-width: 100%;
}

.proto__card--small {
  width: 360px;
  height: 300px;
}

.proto__card--wide {
  width: 720px;
  height: 320px;
}

.proto__card--full {
  width: 100%;
  height: clamp(320px, 42vh, 440px);
}
</style>
