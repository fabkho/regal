<script setup lang="ts">
// Dev only (/dev/row-scrollbar): RegalBooksRow's scroll bar and ‹ › buttons in
// Libellus-like cards (design D, dark and light) at 360 × 300 and 412 wide,
// themed with `--regal-*` tokens. The published shelf (77 Books) comes
// through the dev proxy (nuxt.config.ts); ?n= cuts or repeats it.
// ?n=5|30|50|77|100  ?w=360|412  ?scheme=dark|light  ?bare=1 (cards only).
// Not in a build.
import { COUNTS, PUBLISHED_SRC, pickBooks } from '#layers/regal/app/dev/row-scrollbar/data'
import { readLibraryFile } from '#layers/regal/app/utils/library/libraryFile'
import type { LoadedLibrary } from '#layers/regal/app/utils/library/libraryFile'

definePageMeta({
  middleware: () => {
    if (!import.meta.dev) return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found' }))
  },
})

const route = useRoute()
const router = useRouter()
const count = computed(() => {
  const n = Number(route.query.n)
  return (COUNTS as readonly number[]).includes(n) ? n : 77
})
const widths = computed(() => (route.query.w === '360' ? [360] : route.query.w === '412' ? [412] : [360, 412]))
const schemes = computed<('dark' | 'light')[]>(() => (route.query.scheme === 'dark' ? ['dark'] : route.query.scheme === 'light' ? ['light'] : ['dark', 'light']))
const bare = computed(() => route.query.bare === '1')
const set = (patch: Record<string, string | number | undefined>) => router.replace({ query: { ...route.query, ...patch } })

// The rows must not load the demo library themselves: this page owns the Library.
const loaded = useState<string | null>('regal:library-loaded', () => null)
loaded.value = useRegalConfig().librarySrc

const library = useLibrary()
const file = shallowRef<LoadedLibrary | null>(null)
const failure = ref('')
const ready = ref(false)

function show() {
  if (!file.value) return
  const picked = pickBooks(file.value.books, file.value.assets, count.value)
  library.show({ books: picked.books, assets: picked.assets, owner: file.value.owner }, PUBLISHED_SRC)
  ready.value = true
}
onMounted(async () => {
  try {
    const result = readLibraryFile(await $fetch<string>(PUBLISHED_SRC, { responseType: 'text' }))
    if (!result.ok) throw new Error(result.error.message)
    file.value = result.library
    show()
  }
  catch (cause) {
    failure.value = cause instanceof Error ? cause.message : String(cause)
  }
})
// Another count: the rows start over (as a host's would on a new Library).
const generation = ref(0)
watch(count, () => {
  ready.value = false
  generation.value++
  nextTick(show)
})

useHead({ title: 'Row scroll bar — Regal dev' })
</script>

<template>
  <div
    class="rsp"
    :class="{ 'rsp--bare': bare }"
  >
    <header
      v-if="!bare"
      class="rsp__head"
    >
      <h1>Row scroll bar</h1>
      <p class="rsp__lead">
        Rounded thumb sized to what the card shows, quiet at rest, awake while the row moves or the thumb is held, fades at the ends; drag it. Hover a card (mouse) for the ‹ › buttons.
      </p>

      <nav
        class="rsp__chips"
        aria-label="Books"
      >
        <span>Books</span>
        <button
          v-for="n in COUNTS"
          :key="n"
          type="button"
          :aria-pressed="n === count"
          @click="set({ n: n === 77 ? undefined : n })"
        >
          {{ n }}
        </button>
        <span>Size</span>
        <button
          v-for="w in ['all', '360', '412']"
          :key="w"
          type="button"
          :aria-pressed="(route.query.w ?? 'all') === w"
          @click="set({ w: w === 'all' ? undefined : w })"
        >
          {{ w }}
        </button>
      </nav>
      <p
        v-if="count === 5"
        class="rsp__note"
      >
        5 Books fit the card: the row doesn't scroll, so no scroll bar or buttons show (by design).
      </p>
    </header>

    <p
      v-if="failure"
      class="rsp__error"
    >
      The published library didn't load: {{ failure }}
    </p>

    <template v-else-if="ready">
      <section
        v-for="scheme in schemes"
        :key="`${scheme}-${generation}`"
        class="rsp__room"
        :class="`rsp__room--${scheme}`"
      >
        <h2 v-if="!bare">
          {{ scheme }} · {{ count }} Books
        </h2>
        <div class="rsp__cards">
          <figure
            v-for="width in widths"
            :key="width"
          >
            <DevRowScrollbarCard
              :scheme="scheme"
              :width="width"
            />
            <figcaption v-if="!bare">
              {{ width }} × 300
            </figcaption>
          </figure>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.rsp {
  min-height: 100vh;
  background: #0e0c0a;
  color: #eee7dc;
  font: 0.8rem / 1.4 'Geist Mono', ui-monospace, monospace;
}

.rsp__head {
  padding: 1rem 1rem 0.5rem;
}

.rsp h1 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.rsp__lead,
.rsp__note {
  margin: 0.3rem 0 0.7rem;
  max-width: 44rem;
  color: rgb(238 231 220 / 0.64);
}

.rsp__note {
  color: #efb768;
}

.rsp__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.45rem;
}

.rsp__chips span {
  margin-left: 0.5rem;
  color: rgb(238 231 220 / 0.42);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.rsp__chips span:first-child {
  margin-left: 0;
}

.rsp__chips button {
  padding: 0.35rem 0.6rem;
  border: 1px solid rgb(255 236 210 / 0.16);
  border-radius: 99px;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.rsp__chips button[aria-pressed='true'] {
  border-color: #efb768;
  background: rgb(239 184 104 / 0.14);
  color: #efb768;
}

.rsp__error {
  padding: 1rem;
  color: #ec8063;
}

.rsp__room {
  padding: 1.25rem 1rem 1.5rem;
}

.rsp__room--dark {
  background: #0e0c0a;
}

.rsp__room--light {
  background: #f4f0e9;
  color: #1c1915;
}

.rsp__room h2 {
  margin: 0 0 0.8rem;
  font-size: 0.68rem;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  opacity: 0.55;
}

.rsp__cards {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.rsp__cards figure {
  margin: 0;
}

.rsp__cards figcaption {
  margin-top: 0.4rem;
  font-size: 0.66rem;
  opacity: 0.5;
}

.rsp--bare .rsp__room {
  padding: 12px 12px;
}

@media (max-width: 440px) {
  .rsp__room {
    padding-inline: 0;
  }

  .rsp__cards {
    justify-content: center;
  }

  .rsp__room h2,
  .rsp__cards figcaption {
    padding-inline: 1rem;
  }
}
</style>
