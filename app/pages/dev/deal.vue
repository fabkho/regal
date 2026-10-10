<script setup lang="ts">
// Dev only (/dev/deal): RegalBooksDeal (prototype), the 3D "pick one of these
// Books" shuffle, with synthetic Books (demo/showcase-library.json and its
// drawn covers: never a publisher's art). ?variant=deck|stack|wheel, ?n=2..12,
// ?theme=dark, ?reduced=1, ?duration=2200, ?winner=<index> (for a fixed deal),
// ?seed=<n> (the same look again), ?auto=0 (wait for "Deal again"). The winner is drawn here, with
// crypto.getRandomValues, as a host does: the component never picks. The
// outlined box is the `picked` rect, laid over the page in viewport px:
// it should sit on the winner's front cover. Not in a build.
import { RegalBooksDeal } from '#components'
import type { DealBook, DealPicked, DealVariant } from '#layers/regal/app/utils/deal/book'

definePageMeta({
  middleware: () => {
    if (!import.meta.dev) return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found' }))
  },
})

const VARIANTS: { id: DealVariant, name: string, text: string }[] = [
  { id: 'deck', name: 'A · Deck', text: 'A card game’s shuffle: the Books gather into a deck, riffle twice, get cut, and the top card is turned over.' },
  { id: 'stack', name: 'B · Stack', text: 'Regal’s Stack: the pile re-sorts, a riffle runs through it and slows until the winner stops in the middle.' },
  { id: 'wheel', name: 'C · Wheel', text: 'A carousel against a fixed pointer: it spins, slows, and the winner stops under the marker.' },
]

const route = useRoute()
const router = useRouter()
const base = useRuntimeConfig().app.baseURL.replace(/\/*$/, '/')

interface ShowcaseBook {
  id: string
  title: string
  authors: string[]
  pages: number | null
  binding: string | null
  assets?: { front?: string, spineColor?: string, palette?: { background: string } }
}
const library = ref<{ books: ShowcaseBook[] } | null>(null)

const variant = computed<DealVariant>(() => (VARIANTS.some(v => v.id === route.query.variant) ? route.query.variant as DealVariant : 'deck'))
const count = computed(() => Math.min(12, Math.max(1, Number.parseInt(String(route.query.n ?? '6'), 10) || 6)))
const theme = computed<'light' | 'dark'>(() => (route.query.theme === 'dark' ? 'dark' : 'light'))
const reduced = computed(() => route.query.reduced === '1')
const duration = computed(() => (route.query.duration === '2200' ? 2200 : 4000))
const seed = computed(() => (route.query.seed ? Number.parseInt(String(route.query.seed), 10) : undefined))

function setQuery(patch: Record<string, string | undefined>) {
  router.replace({ query: { ...route.query, ...patch } })
}

/** Synthetic Books from the showcase library, spread over it. */
const books = computed<DealBook[]>(() => {
  const all = library.value?.books ?? []
  return Array.from({ length: count.value }, (_, index) => {
    const book = all[(index * 5) % Math.max(1, all.length)]
    if (!book) return { id: `x${index}`, title: `Book ${index + 1}` }
    return {
      id: book.id,
      title: book.title,
      author: book.authors[0] ?? null,
      pages: book.pages,
      binding: book.binding,
      coverUrl: book.assets?.front ? `${base}${book.assets.front}` : null,
      color: book.assets?.spineColor ?? book.assets?.palette?.background ?? null,
    }
  })
})

/** A uniform random index below `limit`, from crypto (rejection sampling: no modulo bias). */
function randomBelow(limit: number): number {
  const range = 0x100000000
  const max = range - (range % limit)
  const buffer = new Uint32Array(1)
  do crypto.getRandomValues(buffer)
  while (buffer[0]! >= max)
  return buffer[0]! % limit
}

const winner = ref(0)
const round = ref(0)
const picked = ref<DealPicked | null>(null)
const readyAt = ref<number | null>(null)
const startedAt = ref(0)
const deal = ref<{ skip: () => void } | null>(null)
const playing = ref(false)

function dealAgain() {
  const fixed = Number.parseInt(String(route.query.winner ?? ''), 10)
  winner.value = Number.isInteger(fixed) && fixed >= 0 && fixed < count.value && round.value === 0 ? fixed : randomBelow(count.value)
  picked.value = null
  readyAt.value = null
  startedAt.value = performance.now()
  playing.value = true
  round.value++
}

onMounted(async () => {
  library.value = await (await fetch(`${base}showcase-library.json`)).json()
  if (route.query.auto !== '0') dealAgain()
})
// A new variant, count, duration or motion setting deals again at once.
watch([variant, count, duration, reduced], () => {
  if (import.meta.client && route.query.auto !== '0') dealAgain()
})

function onReady() {
  readyAt.value = Math.round(performance.now() - startedAt.value)
}
function onPicked(value: DealPicked) {
  picked.value = value
  playing.value = false
  ;(window as unknown as { __picked?: DealPicked }).__picked = value
}

const description = computed(() => VARIANTS.find(v => v.id === variant.value)!.text)
const boxStyle = computed(() => (picked.value
  ? { left: `${picked.value.rect.left}px`, top: `${picked.value.rect.top}px`, width: `${picked.value.rect.width}px`, height: `${picked.value.rect.height}px` }
  : undefined))
const winnerBook = computed(() => books.value[winner.value])
const readout = computed(() => (picked.value
  ? `${picked.value.id} · #${picked.value.index} · rect ${Math.round(picked.value.rect.left)}, ${Math.round(picked.value.rect.top)}, ${Math.round(picked.value.rect.width)} × ${Math.round(picked.value.rect.height)}`
  : playing.value ? (readyAt.value === null ? 'loading covers…' : `ready after ${readyAt.value} ms, dealing…`) : 'press Deal again'))
</script>

<template>
  <main
    class="deal-dev"
    :class="`deal-dev--${theme}`"
  >
    <nav
      class="deal-dev__bar"
      aria-label="Deal"
    >
      <span class="deal-dev__label">Variant</span>
      <button
        v-for="option in VARIANTS"
        :key="option.id"
        type="button"
        class="deal-dev__option"
        :aria-pressed="variant === option.id"
        @click="setQuery({ variant: option.id })"
      >
        {{ option.name }}
      </button>
      <span class="deal-dev__label deal-dev__label--gap">Books</span>
      <button
        type="button"
        class="deal-dev__option"
        aria-label="Fewer books"
        :disabled="count <= 1"
        @click="setQuery({ n: String(count - 1) })"
      >
        −
      </button>
      <output class="deal-dev__count">{{ count }}</output>
      <button
        type="button"
        class="deal-dev__option"
        aria-label="More books"
        :disabled="count >= 12"
        @click="setQuery({ n: String(count + 1) })"
      >
        +
      </button>
      <button
        type="button"
        class="deal-dev__option deal-dev__option--primary"
        @click="dealAgain"
      >
        Deal again
      </button>
      <button
        type="button"
        class="deal-dev__option"
        :disabled="!playing"
        @click="deal?.skip()"
      >
        Skip
      </button>
      <button
        type="button"
        class="deal-dev__option"
        :aria-pressed="reduced"
        @click="setQuery({ reduced: reduced ? undefined : '1' })"
      >
        Reduced motion
      </button>
      <button
        type="button"
        class="deal-dev__option"
        :aria-pressed="duration === 2200"
        @click="setQuery({ duration: duration === 2200 ? undefined : '2200' })"
      >
        2.2 s
      </button>
      <button
        type="button"
        class="deal-dev__option"
        :aria-pressed="theme === 'dark'"
        @click="setQuery({ theme: theme === 'dark' ? undefined : 'dark' })"
      >
        Dark
      </button>
    </nav>
    <p class="deal-dev__text">
      {{ description }}
    </p>

    <div class="deal-dev__stage">
      <ClientOnly>
        <RegalBooksDeal
          v-if="round > 0"
          :key="round"
          ref="deal"
          class="deal-dev__deal"
          :books="books"
          :winner="winner"
          :variant="variant"
          :duration="duration"
          :reduced-motion="reduced"
          :theme="theme"
          :seed="seed"
          :label="winnerBook ? `Dealing: ${winnerBook.title}` : 'Dealing'"
          @ready="onReady"
          @picked="onPicked"
        />
      </ClientOnly>
    </div>
    <div
      v-if="picked"
      class="deal-dev__box"
      :style="boxStyle"
      aria-hidden="true"
    />
    <p
      class="deal-dev__readout"
      aria-live="off"
    >
      {{ readout }}
    </p>
  </main>
</template>

<style scoped>
.deal-dev {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  height: 100dvh;
  background: var(--color-bg, #F5F2EB);
  color: var(--color-ink, #2C2C2A);
}

.deal-dev--dark {
  --color-bg: #15140F;
  --color-ink: #ECE8DF;
  --color-ink-muted: #A8A399;
  --color-line: rgba(236, 232, 223, 0.16);
  --color-accent: #E0705F;
  background: #15140F;
}

.deal-dev__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 0.8rem 0.3rem;
}

.deal-dev__label {
  margin-right: 0.3rem;
  font-size: var(--text-2xs, 0.65rem);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-ink-muted, #6B6B69);
}

.deal-dev__label--gap {
  margin-left: 0.6rem;
}

.deal-dev__option {
  border-color: var(--color-ink, #2C2C2A);
  color: var(--color-ink, #2C2C2A);
}

.deal-dev__option[aria-pressed="true"] {
  background: var(--color-ink, #2C2C2A);
  color: var(--color-bg, #F5F2EB);
}

.deal-dev__option--primary {
  border-color: var(--color-accent, #B93E2E);
  color: var(--color-accent, #B93E2E);
}

.deal-dev__option:disabled {
  opacity: 0.4;
  cursor: default;
}

.deal-dev__count {
  min-width: 1.5rem;
  text-align: center;
}

.deal-dev__text {
  margin: 0;
  padding: 0 0.8rem 0.4rem;
  font-size: var(--text-xs, 0.7rem);
  color: var(--color-ink-muted, #6B6B69);
}

.deal-dev__stage {
  position: relative;
  min-height: 0;
  margin: 0 0.8rem;
  border: 1px solid var(--color-line, rgba(44, 44, 42, 0.14));
}

.deal-dev__deal {
  position: absolute;
  inset: 0;
}

/* The picked rect, over the page in viewport px. */
.deal-dev__box {
  position: fixed;
  z-index: 5;
  border: 2px dashed var(--color-accent, #B93E2E);
  pointer-events: none;
}

.deal-dev__readout {
  margin: 0;
  padding: 0.4rem 0.8rem 0.6rem;
  font-size: var(--text-xs, 0.7rem);
  color: var(--color-ink-muted, #6B6B69);
}
</style>
