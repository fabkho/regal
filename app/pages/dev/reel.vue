<script setup lang="ts">
// Dev only (/dev/reel): RegalBooksReel as Libellus' "You both read" will show
// it, in the reel prototype's profile (libellus-ref/shared-books-reel-proto:
// its colours, the hero, the eyebrow, the pills and caption in #tooltip, her
// and your stars in #detail-meta). Synthetic Books (app/dev/reel/data.ts).
// ?n=0|1|2|3|12 (default 12)  ?motion=reduce|full (default: the system's)
// ?scheme=dark  ?autoplay=0  ?long=1 (a page to scroll, the reel lower down).
// Not in a build.
import type { Book } from '#layers/regal/shared/types/book'
import type { ReelBookEvent } from '#layers/regal/app/utils/reel/context'
import { ratingText, REEL_COUNTS, REEL_SAMPLES, reelLibrary } from '#layers/regal/app/dev/reel/data'

definePageMeta({
  middleware: () => {
    if (!import.meta.dev) return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found' }))
  },
})

const route = useRoute()
const router = useRouter()
const count = computed(() => {
  const n = Number(route.query.n ?? 12)
  return (REEL_COUNTS as readonly number[]).includes(n) ? n : 12
})
const motion = computed(() => (route.query.motion === 'reduce' ? true : route.query.motion === 'full' ? false : undefined))
const dark = computed(() => route.query.scheme === 'dark')
const autoplay = computed(() => route.query.autoplay !== '0')
const long = computed(() => route.query.long === '1')
const set = (patch: Record<string, string | number | undefined>) => router.replace({ query: { ...route.query, ...patch } })

// The document is built in the browser: its covers must be absolute URLs (this page's origin).
const base = ref('')
onMounted(() => {
  base.value = new URL(useRuntimeConfig().app.baseURL || '/', window.location.href).href
})
const library = computed(() => (base.value ? reelLibrary(count.value, base.value) : null))
const samples = new Map(REEL_SAMPLES.map(sample => [sample.id, sample]))
const sample = (book: Book) => samples.get(book.id)

// What the reel tells the host.
const log = ref<string[]>([])
const started = typeof performance === 'undefined' ? 0 : performance.now()
function note(text: string) {
  const at = ((performance.now() - started) / 1000).toFixed(1)
  log.value = [`${at}s ${text}`, ...log.value].slice(0, 12)
}
const opened = ref<string | null>(null)
function onOpen(event: ReelBookEvent) {
  note(`open ${event.id} (${event.book.title})`)
  opened.value = event.book.title
  setTimeout(() => (opened.value = null), 2200)
}
</script>

<template>
  <div
    class="reel-dev"
    :class="{ 'reel-dev--dark': dark }"
    :data-theme="dark ? 'dark' : 'light'"
  >
    <div class="reel-dev__ambient" />
    <main class="reel-dev__page">
      <div class="reel-dev__label">
        A · REEL
      </div>
      <header class="reel-dev__hero">
        <div class="reel-dev__ring">
          L
        </div>
        <div class="reel-dev__name">
          Lena Hartmann
        </div>
        <div class="reel-dev__lib">
          48 read · 2 reading · 17 want
        </div>
      </header>
      <div
        v-if="long"
        class="reel-dev__spacer"
      >
        Scroll down: the reel plays once it is in view.
      </div>
      <section class="reel-dev__section">
        <div class="reel-dev__eyebrow">
          <span>You both read</span><span>{{ count }}</span>
        </div>
        <RegalBooksReel
          class="reel-dev__reel"
          :library="library"
          label="Books you both read"
          :reduced-motion="motion"
          :autoplay="autoplay"
          :theme="dark ? 'dark' : 'light'"
          @ready="note('ready')"
          @focus="event => note(`focus ${event.index + 1} ${event.book.title}`)"
          @manual="note('manual')"
          @open="onOpen"
        >
          <template #tooltip="{ book }">
            <div class="reel-dev__pills">
              <span class="reel-dev__pill reel-dev__pill--hers"><span
                class="reel-dev__avatar"
                style="background: hsl(200 35% 62%)"
              >L</span><span class="reel-dev__star">{{ sample(book)?.hers == null ? '' : '★' }}</span><span>{{ sample(book)?.hers == null ? 'not shown' : ratingText(sample(book)!.hers) }}</span></span>
              <span class="reel-dev__pill reel-dev__pill--mine"><span
                class="reel-dev__avatar"
                style="background: hsl(30 35% 62%)"
              >F</span><span class="reel-dev__star">★</span><span>{{ ratingText(sample(book)?.mine ?? null) }}</span></span>
            </div>
            <div class="reel-dev__caption">
              <div class="reel-dev__title">
                {{ book.title }}
              </div>
              <div class="reel-dev__author">
                {{ book.author }}
              </div>
            </div>
          </template>
          <template #detail-meta="{ book }">
            <p class="reel-dev__meta">
              L ★ {{ ratingText(sample(book)?.hers ?? null) }} · F ★ {{ ratingText(sample(book)?.mine ?? null) }}
            </p>
          </template>
        </RegalBooksReel>
      </section>

      <p
        v-if="opened"
        class="reel-dev__toast"
        role="status"
      >
        Would open the Book page: {{ opened }}
      </p>

      <section class="reel-dev__controls">
        <div class="reel-dev__row">
          <span>Books</span>
          <button
            v-for="n in REEL_COUNTS"
            :key="n"
            type="button"
            :aria-pressed="count === n"
            @click="set({ n })"
          >
            {{ n }}
          </button>
        </div>
        <div class="reel-dev__row">
          <span>Motion</span>
          <button
            type="button"
            :aria-pressed="motion === undefined"
            @click="set({ motion: undefined })"
          >
            system
          </button>
          <button
            type="button"
            :aria-pressed="motion === true"
            @click="set({ motion: 'reduce' })"
          >
            reduce
          </button>
          <button
            type="button"
            :aria-pressed="motion === false"
            @click="set({ motion: 'full' })"
          >
            full
          </button>
        </div>
        <div class="reel-dev__row">
          <span>Page</span>
          <button
            type="button"
            :aria-pressed="dark"
            @click="set({ scheme: dark ? undefined : 'dark' })"
          >
            dark
          </button>
          <button
            type="button"
            :aria-pressed="!autoplay"
            @click="set({ autoplay: autoplay ? '0' : undefined })"
          >
            no autoplay
          </button>
          <button
            type="button"
            :aria-pressed="long"
            @click="set({ long: long ? undefined : '1' })"
          >
            long page
          </button>
        </div>
        <ol
          class="reel-dev__log"
          aria-label="Events"
        >
          <li
            v-for="(line, index) in log"
            :key="`${index}-${line}`"
          >
            {{ line }}
          </li>
        </ol>
      </section>
      <div
        v-if="long"
        class="reel-dev__spacer"
      />
    </main>
  </div>
</template>

<style scoped>
/* The prototype's page (base.css): Libellus' surface, ink and amber accent. */
.reel-dev {
  --surface: #f4f0e9;
  --ink: #1c1915;
  --muted: rgb(28 25 21 / 0.74);
  --faint: rgb(28 25 21 / 0.62);
  --accent: #b8782a;
  --hair: rgb(40 30 20 / 0.1);
  /* Regal's tokens in Libellus' colours. */
  --regal-surface: var(--surface);
  --regal-surface-raised: #fbf9f5;
  --regal-ink: var(--ink);
  --regal-ink-muted: var(--muted);
  --regal-accent: var(--accent);
  --regal-hairline: var(--hair);
  --regal-border: rgb(40 30 20 / 0.14);
  --regal-radius: 14px;
  --regal-radius-control: 999px;
  --regal-shadow: 0 1px 0 rgb(40 30 20 / 0.08), 0 4px 14px rgb(40 30 20 / 0.1);
  --regal-font-title: Georgia, serif;
  --regal-font-body: -apple-system, system-ui, sans-serif;
  --regal-style-title: normal;
  position: relative;
  min-height: 100dvh;
  overflow-x: hidden;
  background: var(--surface);
  color: var(--ink);
  font: 400 15px/1.4 -apple-system, system-ui, sans-serif;
}

.reel-dev--dark {
  --surface: #1c1a17;
  --ink: #efe9df;
  --muted: rgb(239 233 223 / 0.74);
  --faint: rgb(239 233 223 / 0.6);
  --hair: rgb(239 233 223 / 0.16);
  --regal-surface-raised: #26231f;
  --regal-border: rgb(239 233 223 / 0.2);
}

.reel-dev__ambient {
  position: absolute;
  inset: 0 0 auto;
  height: 520px;
  background: radial-gradient(120% 70% at 50% 0%, rgb(31 63 91 / 0.2), transparent 70%);
  pointer-events: none;
}

.reel-dev__page {
  position: relative;
  max-width: 430px;
  margin: 0 auto;
  padding: 0 20px 3rem;
}

.reel-dev__label {
  position: absolute;
  top: 8px;
  left: 12px;
  color: var(--accent);
  font: 600 11px ui-monospace, monospace;
  letter-spacing: 0.06em;
}

.reel-dev__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 0 18px;
}

.reel-dev__ring {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: hsl(200 30% 70%);
  color: #fff;
  font: 500 26px system-ui;
}

.reel-dev__name {
  margin-top: 10px;
  font: 500 20px/1.2 Georgia, serif;
}

.reel-dev__lib {
  margin-top: 4px;
  color: var(--faint);
  font: 400 11px/1.3 ui-monospace, monospace;
  letter-spacing: 0.02em;
}

.reel-dev__spacer {
  display: grid;
  place-items: center;
  height: 120vh;
  color: var(--faint);
  font-size: 12px;
}

.reel-dev__section {
  position: relative;
  margin-top: 6px;
}

.reel-dev__eyebrow {
  display: flex;
  justify-content: space-between;
  color: var(--faint);
  font: 500 10.5px/12px system-ui;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

/* The prototype's stage spans the card's full width (margin: 10px -20px 0). */
.reel-dev__reel {
  margin: 10px -20px 0;
}

.reel-dev__pills {
  display: flex;
  justify-content: center;
  gap: 120px;
  height: 34px;
}

.reel-dev__pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px 0 3px;
  border-radius: 15px;
  background: rgb(251 249 245 / 0.72);
  backdrop-filter: blur(12px);
  box-shadow: 0 1px 0 rgb(40 30 20 / 0.08), 0 4px 14px rgb(40 30 20 / 0.1);
  color: #1c1915;
  font: 500 12px/1 system-ui;
  white-space: nowrap;
  /* The prototype's pills slide in from the sides as the beat lands (--regal-reel-badge 0…1). */
  transform: translateX(calc(var(--dx) * (1 - var(--regal-reel-badge, 1)) * 14px)) scale(calc(0.96 + 0.04 * var(--regal-reel-badge, 1)));
}

.reel-dev__pill--hers {
  --dx: 1;
}

.reel-dev__pill--mine {
  --dx: -1;
}

.reel-dev__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: #fff;
  font: 600 11px system-ui;
}

.reel-dev__star {
  color: var(--accent);
  letter-spacing: -0.5px;
}

.reel-dev__caption {
  min-height: 38px;
  margin-top: 14px;
  text-align: center;
}

.reel-dev__title {
  font: 500 15px/1.25 Georgia, serif;
}

.reel-dev__author {
  color: var(--muted);
  font: 400 12px/1.3 system-ui;
}

.reel-dev__meta {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: 13px;
}

.reel-dev__toast {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  z-index: 60;
  margin: 0;
  padding: 0.5rem 0.9rem;
  border-radius: 999px;
  background: var(--ink);
  color: var(--surface);
  font-size: 13px;
  transform: translateX(-50%);
}

.reel-dev__controls {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid var(--hair);
  font: 400 12px/1.4 ui-monospace, monospace;
}

.reel-dev__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 0.6rem;
}

.reel-dev__row > span {
  width: 4.5rem;
  color: var(--faint);
}

.reel-dev__row button {
  min-width: 2.2rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--hair);
  border-radius: 999px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}

.reel-dev__row button[aria-pressed="true"] {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--surface);
}

.reel-dev__log {
  margin: 0.8rem 0 0;
  padding: 0;
  color: var(--faint);
  list-style: none;
}
</style>
