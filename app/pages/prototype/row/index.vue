<script setup lang="ts">
// Design round (horizontal Stack), dev only: the three prototype rows side by
// side at phone-card size, what each is good and bad at, the measurements and
// the recommendation (also in COMPARE.md of the round). Not shipped.
import { ROW_VARIANTS } from '#layers/regal/app/prototype/row/layout'
import type { RowVariantKey } from '#layers/regal/app/prototype/row/layout'
import { ROW_FINDINGS, ROW_RECOMMENDATION } from '#layers/regal/app/prototype/row/findings'
import { useRowLibrary } from '#layers/regal/app/prototype/row/useRowLibrary'

const route = useRoute()
const { books, error, loading, count, year, source, order } = useRowLibrary()
const keys: Exclude<RowVariantKey, 's'>[] = ['a', 'b', 'c']
const title = computed(() => (year.value ? `Read in ${year.value}` : `${books.value.length} books read`))
const query = (patch: Record<string, string | number | undefined>) => ({ query: { ...route.query, ...patch } })

useHead({ title: 'Horizontal Stack: three prototypes — Regal' })
</script>

<template>
  <div class="compare">
    <header class="compare__head">
      <p class="compare__kicker">
        Regal · design round · dev only
      </p>
      <h1>The Stack, sideways</h1>
      <p class="compare__next">
        Round 2, from (a): <NuxtLink to="/prototype/row/stack">the horizontal Stack →</NuxtLink>
      </p>
      <p>
        Three ways to show the Books side by side, left to right, inline in a card (Libellus: the year in review, the Profile).
        Each card below is live: swipe or drag sideways (a vertical swipe scrolls this page), tap a Book to take it out, tap it
        again to turn it, flick it to turn it over, Back (button, browser, Escape) puts it away. Same library file, same assets,
        same Pick as the Stack.
      </p>
      <p class="compare__controls">
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
          :to="query({ year: 2025, n: undefined, order: 'chrono' })"
          :aria-current="year === 2025 ? 'true' : undefined"
        >year 2025, Jan → Dec</NuxtLink>
        · Library:
        <NuxtLink
          :to="query({ src: undefined })"
          :aria-current="source === 'published' ? 'true' : undefined"
        >published (AI art)</NuxtLink>
        <NuxtLink
          :to="query({ src: 'demo' })"
          :aria-current="source === 'demo' ? 'true' : undefined"
        >demo</NuxtLink>
      </p>
      <p
        v-if="error"
        class="compare__error"
      >
        {{ error }}
      </p>
    </header>

    <div class="compare__grid">
      <article
        v-for="key in keys"
        :key="key"
        class="compare__variant"
      >
        <h2>
          <span class="compare__letter">{{ key }}</span> {{ ROW_VARIANTS[key].name }}
        </h2>
        <p class="compare__blurb">
          {{ ROW_VARIANTS[key].blurb }}
        </p>
        <PrototypeRowCard
          v-if="!loading && books.length"
          class="compare__card"
          :variant="key"
          :books="books"
          :order="order"
          :title="title"
        />
        <div
          v-else
          class="compare__card compare__card--empty"
        >
          Loading…
        </div>
        <p class="compare__open">
          <NuxtLink :to="{ path: `/prototype/row/${key}`, query: route.query }">
            Card sizes and full width →
          </NuxtLink>
        </p>
        <dl class="compare__facts">
          <template
            v-for="fact in ROW_FINDINGS[key].facts"
            :key="fact.label"
          >
            <dt>{{ fact.label }}</dt>
            <dd>{{ fact.value }}</dd>
          </template>
        </dl>
        <h3>Good</h3>
        <ul>
          <li
            v-for="line in ROW_FINDINGS[key].good"
            :key="line"
          >
            {{ line }}
          </li>
        </ul>
        <h3>Less good</h3>
        <ul>
          <li
            v-for="line in ROW_FINDINGS[key].bad"
            :key="line"
          >
            {{ line }}
          </li>
        </ul>
      </article>
    </div>

    <section class="compare__recommend">
      <h2>Recommendation</h2>
      <p
        v-for="line in ROW_RECOMMENDATION"
        :key="line"
      >
        {{ line }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.compare {
  max-width: 1240px;
  margin: 0 auto;
  padding: 1.5rem 1rem 30vh;
}

.compare__kicker {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.compare__head h1 {
  margin: 0.3rem 0 0.5rem;
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 400;
  font-size: var(--text-2xl);
}

.compare__head p {
  max-width: 52rem;
  margin: 0.3rem 0;
  color: var(--color-ink-muted);
}

.compare__controls a {
  margin: 0 0.25rem;
}

.compare__controls [aria-current] {
  color: var(--color-ink);
  text-decoration: underline;
}

.compare__error {
  color: var(--color-accent) !important;
}

.compare__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 2rem 1.5rem;
  margin-top: 2rem;
}

.compare__variant h2 {
  margin: 0;
  font-size: var(--text-md);
  font-weight: 600;
}

.compare__letter {
  display: inline-block;
  width: 1.4rem;
  color: var(--color-accent);
  text-transform: uppercase;
}

.compare__blurb {
  min-height: 7.2em;
  margin: 0.3rem 0 0.8rem;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.compare__card {
  width: 360px;
  max-width: 100%;
  height: 300px;
}

.compare__card--empty {
  display: grid;
  place-items: center;
  border: 1px solid var(--color-line);
  color: var(--color-ink-faint);
}

.compare__open {
  margin: 0.4rem 0 0.8rem;
  font-size: var(--text-xs);
}

.compare__facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.8rem;
  margin: 0 0 0.8rem;
  padding: 0.6rem 0;
  border-top: 1px solid var(--color-ink);
  border-bottom: 1px solid var(--color-line);
  font-size: var(--text-xs);
}

.compare__facts dt {
  color: var(--color-ink-muted);
}

.compare__facts dd {
  margin: 0;
}

.compare__variant h3 {
  margin: 0.6rem 0 0.2rem;
  font-size: var(--text-2xs);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.compare__variant ul {
  margin: 0;
  padding-left: 1.1rem;
  font-size: var(--text-sm);
}

.compare__variant li + li {
  margin-top: 0.2rem;
}

.compare__recommend {
  max-width: 52rem;
  margin-top: 2.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-ink);
}

.compare__recommend h2 {
  margin: 0 0 0.5rem;
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.compare__recommend p {
  margin: 0 0 0.6rem;
}
</style>
