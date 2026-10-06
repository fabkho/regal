<script setup lang="ts">
// Dev only (/dev/theming): RegalBooksStage and RegalBooksRow the way a host
// themes them (docs/nuxt-layer.md: "Theming"), with the same props and slots.
// ?look=default|dark|auto|tokens|slots|parts|unstyled, ?show=both|stage|row,
// ?inspect=card|viewport (the row); the switches keep them in the URL. Hover
// a Book for the tooltip, click it for the detail panel; a narrow window
// shows the sheet. Not in a build.
import { RegalBooksRow, RegalBooksStage } from '#components'
import type { RegalTheme } from '#layers/regal/app/utils/theme/tokens'

definePageMeta({
  middleware: () => {
    if (!import.meta.dev) return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found' }))
  },
})

const LOOKS = ['default', 'dark', 'auto', 'tokens', 'slots', 'parts', 'unstyled'] as const
type Look = typeof LOOKS[number]

const route = useRoute()
const router = useRouter()
const look = computed<Look>(() => (LOOKS as readonly string[]).includes(String(route.query.look)) ? route.query.look as Look : 'default')
function setLook(value: Look) {
  router.replace({ query: { ...route.query, look: value === 'default' ? undefined : value } })
}

const SHOWS = ['both', 'stage', 'row'] as const
type Show = typeof SHOWS[number]
const show = computed<Show>(() => (SHOWS as readonly string[]).includes(String(route.query.show)) ? route.query.show as Show : 'both')
const INSPECTS = ['card', 'viewport'] as const
type Inspect = typeof INSPECTS[number]
const inspect = computed<Inspect>(() => route.query.inspect === 'viewport' ? 'viewport' : 'card')
function setQuery(key: 'show' | 'inspect', value: string, fallback: string) {
  router.replace({ query: { ...route.query, [key]: value === fallback ? undefined : value } })
}

/** The components shown, each with the same theme, unstyled and slots. */
const parts = computed(() => [
  { key: 'stage', is: RegalBooksStage, class: 'theming__stage', props: {} },
  { key: 'row', is: RegalBooksRow, class: 'theming__row', props: { inspect: inspect.value } },
].filter(part => show.value === 'both' || show.value === part.key))

const theme = computed<RegalTheme | undefined>(() => {
  if (look.value === 'dark' || look.value === 'tokens' || look.value === 'slots' || look.value === 'parts') return 'dark'
  if (look.value === 'auto') return 'auto'
  return undefined
})

/** `auto`: the page flips <html data-theme> like a host would. */
const hostTheme = ref<'light' | 'dark'>('dark')
useHead({
  htmlAttrs: { 'data-theme': () => (look.value === 'auto' ? hostTheme.value : undefined) },
})

const stars = (rating: number) => '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating))
const finished = (date: string | null) => (date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : null)
</script>

<template>
  <div
    class="theming"
    :class="[`theming--${look}`, `theming--show-${show}`]"
    :data-host-theme="look === 'auto' ? hostTheme : undefined"
  >
    <nav
      class="theming__bar"
      aria-label="Look"
    >
      <span class="theming__label">Theming</span>
      <button
        v-for="option in LOOKS"
        :key="option"
        type="button"
        class="theming__option"
        :aria-pressed="look === option"
        @click="setLook(option)"
      >
        {{ option }}
      </button>
      <button
        v-if="look === 'auto'"
        type="button"
        class="theming__option"
        @click="hostTheme = hostTheme === 'dark' ? 'light' : 'dark'"
      >
        html data-theme: {{ hostTheme }}
      </button>
      <span class="theming__label theming__label--gap">Show</span>
      <button
        v-for="option in SHOWS"
        :key="option"
        type="button"
        class="theming__option"
        :aria-pressed="show === option"
        @click="setQuery('show', option, 'both')"
      >
        {{ option }}
      </button>
      <span class="theming__label theming__label--gap">Row inspect</span>
      <button
        v-for="option in INSPECTS"
        :key="option"
        type="button"
        class="theming__option"
        :aria-pressed="inspect === option"
        @click="setQuery('inspect', option, 'card')"
      >
        {{ option }}
      </button>
    </nav>

    <component
      :is="part.is"
      v-for="part in parts"
      :key="part.key"
      :class="part.class"
      v-bind="part.props"
      :theme="theme"
      :unstyled="look === 'unstyled'"
    >
      <template
        v-if="look === 'slots'"
        #tooltip="{ book }"
      >
        <span class="host-tooltip">
          <strong>{{ book.title }}</strong>
          <span v-if="book.author"> — {{ book.author }}</span>
        </span>
      </template>
      <template
        v-if="look === 'slots'"
        #detail="{ book, close, flip, face }"
      >
        <div class="host-detail">
          <p class="host-detail__eyebrow">
            {{ book.status.replace(/-/g, ' ') }}
          </p>
          <h2 class="host-detail__title">
            {{ book.title }}
          </h2>
          <p class="host-detail__author">
            {{ book.author }}
          </p>
          <p
            v-if="book.rating"
            class="host-detail__stars"
          >
            {{ stars(book.rating) }}
          </p>
          <p
            v-if="book.description"
            class="host-detail__blurb"
          >
            {{ book.description }}
          </p>
          <div class="host-detail__actions">
            <button
              type="button"
              class="host-button"
              @click="flip"
            >
              {{ face === 'front' ? 'Turn over' : 'Front' }}
            </button>
            <button
              type="button"
              class="host-button host-button--primary"
              @click="close"
            >
              Done
            </button>
          </div>
        </div>
      </template>

      <template
        v-if="look === 'parts'"
        #detail-header="{ book }"
      >
        <h2 class="host-detail__title">
          {{ book.title }}
        </h2>
        <p class="host-detail__author">
          by {{ book.author }} · {{ book.rating ? stars(book.rating) : 'not rated' }}
        </p>
      </template>
      <template
        v-if="look === 'parts'"
        #detail-about="{ book, description }"
      >
        <p class="host-detail__eyebrow">
          {{ finished(book.dateRead) ? `Finished ${finished(book.dateRead)}` : 'Not finished' }}
        </p>
        <p class="host-detail__blurb">
          {{ description ?? 'No blurb for this one.' }}
        </p>
      </template>
    </component>
  </div>
</template>

<style scoped>
.theming {
  display: grid;
  grid-auto-rows: auto;
  grid-template-rows: auto minmax(32rem, 1fr);
  min-height: 100dvh;
}

.theming--show-row {
  grid-template-rows: auto auto;
  align-content: start;
}

.theming__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-line);
  background: var(--color-bg);
  color: var(--color-ink);
}

.theming__label {
  margin-right: 0.5rem;
  font-size: var(--text-2xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.theming__option[aria-pressed="true"] {
  background: var(--color-ink);
  color: var(--color-bg);
}

.theming__label--gap {
  margin-left: 1rem;
}

.theming__stage {
  min-height: 32rem;
}

/* The row as a card in the host's page. */
.theming__row {
  width: min(46rem, calc(100% - 2rem));
  height: 20rem;
  margin: 1.5rem 1rem 3rem;
}

/* The host's page behind the stage. */
.theming--dark,
.theming--slots,
.theming--parts,
.theming--auto[data-host-theme="dark"] {
  background: #15140F;
}

.theming--tokens {
  background: #0E1117;
}

/* A host's own tokens, set on its wrapper (they reach the parts in <body> too). */
.theming--tokens .theming__stage,
.theming--tokens .theming__row {
  --regal-surface: rgba(23, 27, 36, 0.82);
  --regal-surface-raised: rgba(23, 27, 36, 0.9);
  --regal-ink: #E7E3D8;
  --regal-ink-muted: #9AA1AE;
  --regal-ink-subtle: #C9CDD6;
  --regal-accent: #E2B04A;
  --regal-accent-hover: #F2C566;
  --regal-hairline: rgba(231, 227, 216, 0.14);
  --regal-border: rgba(231, 227, 216, 0.12);
  --regal-radius: 12px;
  --regal-radius-control: 999px;
  --regal-shadow: 0 18px 40px rgba(0, 0, 0, 0.5);
  --regal-backdrop: blur(14px) saturate(1.2);
  --regal-font-title: Georgia, 'Times New Roman', serif;
  --regal-style-title: normal;
  --regal-weight-title: 600;
  --regal-label-tracking: 0.12em;
  --regal-panel-padding: 1.25rem 1.4rem;
  --regal-tooltip-padding: 0.4rem 0.75rem;
}

/* The unstyled panel, dressed by the host's own CSS only. */
.theming--unstyled .theming__stage,
.theming--unstyled .theming__row {
  color: #1C2733;
  font-family: system-ui, sans-serif;
}

/* The unstyled row card, framed by the host. */
.theming--unstyled .theming__row {
  border: 1px solid #C8D1DB;
  border-radius: 8px;
  background: #FFF;
}

/* Global: the hover label and the phone's sheet live in <body>. */
:global(.regal--unstyled.details),
:global(.regal--unstyled.hover-label),
:global(.regal--unstyled.focus-label),
:global(.regal--unstyled.label-morph),
:global(.regal--unstyled.row-card__details--sheet),
:global(.regal--unstyled.row-card__details--card),
:global(.regal--unstyled.row-card__back--out) {
  border-radius: 6px;
  background: #FFF;
  color: #1C2733;
  font-family: system-ui, sans-serif;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}

.host-tooltip {
  font-family: Georgia, serif;
  font-size: 0.85rem;
}

.host-detail {
  display: grid;
  gap: 0.35rem;
}

.host-detail__eyebrow {
  margin: 0;
  color: var(--regal-accent, #E0705F);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
}

.host-detail__title {
  margin: 0;
  font-family: Georgia, serif;
  font-size: 1.35rem;
  font-weight: 600;
}

.host-detail__author,
.host-detail__stars {
  margin: 0;
  opacity: 0.8;
}

.host-detail__blurb {
  margin: 0.4rem 0 0;
  max-height: 7rem;
  overflow: auto;
  font-size: 0.75rem;
  line-height: 1.5;
}

.host-detail__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.6rem;
}

.host-button {
  padding: 0.4rem 0.9rem;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.75rem;
  text-transform: none;
  letter-spacing: normal;
  cursor: pointer;
}

.host-button--primary {
  border-color: #E0705F;
  background: #E0705F;
  color: #15140F;
}
</style>
