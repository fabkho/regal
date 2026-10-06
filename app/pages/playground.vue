<script setup lang="ts">
// Regal's own site: the playground. The layer's real components
// (RegalBooksStage, RegalBooksSidebar, RegalBooksFilters, RegalBooksRow) with
// every prop, theme token preset and slot a host can set, driven from a panel
// and kept in the URL (app/showcase/settings.ts); the host-side settings
// (runtimeConfig.public.regal) as the code a host writes. `?frame=1` is the
// preview alone, for the phone frame (an iframe of this page).
//
// This page owns the Library: the showcase shelf, the demo, a URL or a file
// the visitor drops (read in the tab, never uploaded or kept). Hosts don't get
// this page or its components (nuxt.config.ts).
import type { LibraryReadResult } from '#layers/regal/app/utils/library/libraryFile'
import { readLibraryFile, unreachableFileError } from '#layers/regal/app/utils/library/libraryFile'
import { fetchLibraryFile } from '#layers/regal/app/utils/library/libraryCache'
import type { PlaygroundSettings } from '#layers/regal/app/showcase/settings'
import { readSettings, writeSettings } from '#layers/regal/app/showcase/settings'

const route = useRoute()
const router = useRouter()
const settings = computed(() => readSettings(route.query))
const frame = computed(() => route.query.frame === '1')

function update(patch: Partial<PlaygroundSettings>) {
  router.replace({ query: writeSettings({ ...settings.value, ...patch }, route.query) })
}

/** The site's base path ('/regal/' on GitHub Pages): the library files are served under it. */
const base = useRuntimeConfig().app.baseURL.replace(/\/*$/, '/')
const FILES = {
  shelf: { src: `${base}showcase-library.json` },
  demo: { src: `${base}demo-library.json` },
}

// The components load librarySrc themselves unless the Library is marked as
// loaded from it: here the page shows what the visitor picks instead.
const loaded = useState<string | null>('regal:library-loaded', () => null)
loaded.value = useRegalConfig().librarySrc
const library = useLibrary()
const ready = ref(false)
const dropped = shallowRef<{ name: string, text: string } | null>(null)
let generation = 0

/** A dropped file has no URL: relative image references in it can't resolve, so they are drawn. */
const droppedSrc = (name: string) => `about:blank#${encodeURIComponent(name)}`

async function load() {
  const current = ++generation
  const wanted = settings.value
  let src: string
  let result: LibraryReadResult
  if (wanted.library === 'file') {
    if (!dropped.value) {
      library.fail({ message: 'No library file yet.', details: ['Drop a Regal library file in the panel (04 · Library file).'], more: 0 }, null)
      ready.value = true
      return
    }
    src = droppedSrc(dropped.value.name)
    result = readLibraryFile(dropped.value.text)
  }
  else {
    src = wanted.library === 'url' ? wanted.src : FILES[wanted.library].src
    try {
      result = await fetchLibraryFile(new URL(src, window.location.href).href)
    }
    catch (cause) {
      result = { ok: false, error: unreachableFileError(src, cause) }
    }
  }
  if (current !== generation) return
  if (result.ok) library.show(result.library, src)
  else library.fail(result.error, src)
  ready.value = true
}

async function readDropped(file: File) {
  dropped.value = { name: file.name, text: await file.text() }
  if (settings.value.library !== 'file') update({ library: 'file' })
  else void load()
  sendToFrame()
}

onMounted(load)
watch(() => [settings.value.library, settings.value.src], () => void load())

// The phone frame is another page: a dropped file goes to it by message.
const MESSAGE = 'regal-playground:library'
const frameElement = ref<HTMLIFrameElement | null>(null)
function sendToFrame() {
  if (dropped.value) frameElement.value?.contentWindow?.postMessage({ type: MESSAGE, ...dropped.value }, window.location.origin)
}
function onMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin || typeof event.data !== 'object' || !event.data) return
  if (event.data.type === `${MESSAGE}:ready`) sendToFrame()
  if (event.data.type === MESSAGE && frame.value && typeof event.data.text === 'string') {
    dropped.value = { name: String(event.data.name), text: event.data.text }
    void load()
  }
}
onMounted(() => {
  window.addEventListener('message', onMessage)
  if (frame.value && window.parent !== window) window.parent.postMessage({ type: `${MESSAGE}:ready` }, window.location.origin)
})
onBeforeUnmount(() => window.removeEventListener('message', onMessage))

/** The phone frame: this page at 390 px, the same settings, preview only. */
const frameQuery = computed(() => ({ ...route.query, frame: '1', device: undefined }))
const frameSrc = refDebounced(computed(() => router.resolve({ path: route.path, query: frameQuery.value }).href), 350)

const libraryNote = computed(() => {
  if (!ready.value) return 'Loading the library file…'
  if (library.error.value) return `${library.error.value.message} ${library.error.value.details[0] ?? ''}`.trim()
  const owner = library.source.value?.owner
  const read = library.books.value.filter(book => book.status === 'read').length
  return `${owner ? `${owner}'s library` : 'A library'}: ${library.books.value.length} Books, ${read} read.`
})
const hostSrc = computed(() => (settings.value.library === 'url' ? settings.value.src : '/books/library.json'))

useHead({
  title: 'Regal — playground',
  htmlAttrs: { 'data-theme': () => (settings.value.theme === 'auto' ? settings.value.hostScheme : undefined) },
  meta: [{ name: 'description', content: 'Every prop, theme token and slot of the Regal Nuxt layer, live: the 3D Stack, the row, the filters, the bottom sheet.' }],
})
</script>

<template>
  <div
    class="pg"
    :class="{ 'pg--frame': frame }"
  >
    <template v-if="frame">
      <ShowcasePreview
        v-if="ready"
        class="pg__frame-preview"
        :settings="settings"
      />
    </template>

    <template v-else>
      <header class="pg__head">
        <a
          :href="base"
          class="pg__title"
        >Regal</a>
        <h1 class="pg__name">
          Playground
        </h1>
        <p class="pg__tagline">
          The Nuxt layer, every prop, token and slot, live.
        </p>
        <nav
          class="pg__nav"
          aria-label="Regal"
        >
          <a :href="base">Viewer</a>
          <a :href="`${base}row`">Row</a>
          <a
            href="https://github.com/fabkho/regal"
            target="_blank"
            rel="noopener"
          >GitHub ↗</a>
        </nav>
      </header>

      <main class="pg__main">
        <section
          class="pg__preview"
          aria-label="Preview"
        >
          <div
            v-if="settings.device === 'phone'"
            class="pg__phone"
          >
            <iframe
              ref="frameElement"
              class="pg__phone-screen"
              :src="frameSrc"
              title="The playground at a phone's width"
            />
            <p class="pg__phone-note">
              390 × 780 · the same page, preview only
            </p>
          </div>
          <ShowcasePreview
            v-else-if="ready"
            :settings="settings"
          />
          <p
            v-else
            class="pg__loading"
          >
            Loading the library file…
          </p>
        </section>

        <aside
          class="pg__panel"
          aria-label="Settings"
        >
          <ShowcasePanel
            :settings="settings"
            :library-src="hostSrc"
            :library-note="libraryNote"
            :library-failed="Boolean(library.error.value)"
            :file-name="dropped?.name ?? null"
            @update="update"
            @file="readDropped"
          />
        </aside>
      </main>

      <footer class="pg__foot">
        <span>The showcase shelf and the demo are synthetic: public-domain titles, invented ratings, dates and reviews; every face is drawn.</span>
        <span>
          Bookcase model:
          <a
            href="https://sketchfab.com/3d-models/antique-wooden-bookcase-game-model-75aa9519195647d99cf1e2d4863dbe87"
            target="_blank"
            rel="noopener"
          >Lorenzo Drago ↗</a> · CC BY 4.0
        </span>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.pg {
  --pg-head: 4.25rem;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 100dvh;
}

.pg--frame {
  display: block;
}

.pg__frame-preview {
  min-height: 100dvh;
}

.pg__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem 1rem;
  min-height: var(--pg-head);
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--color-ink);
}

.pg__title {
  color: var(--color-ink);
  font-family: var(--font-serif);
  font-size: var(--text-2xl);
  font-style: italic;
  line-height: 1;
}

.pg__title:hover {
  color: var(--color-accent);
  text-decoration: none;
}

.pg__name {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.pg__name::before {
  content: '/ ';
  color: var(--color-accent);
}

.pg__tagline {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.pg__nav {
  display: flex;
  gap: 1.25rem;
  margin-left: auto;
  font-size: var(--text-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pg__nav a {
  color: var(--color-ink-muted);
}

.pg__nav a:hover {
  color: var(--color-accent);
}

.pg__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(19rem, 24rem);
  height: calc(100dvh - var(--pg-head));
  min-height: 34rem;
}

.pg__preview {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.pg__panel {
  min-height: 0;
  overflow-y: auto;
  border-left: 1px solid var(--color-ink);
  scrollbar-width: thin;
  scrollbar-color: var(--color-ink-faint) transparent;
}

.pg__loading {
  place-self: center;
  color: var(--color-ink-muted);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pg__phone {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.75rem;
  padding: 1.5rem;
  overflow: auto;
  background:
    repeating-linear-gradient(135deg, transparent 0 11px, var(--color-line) 11px 12px);
}

.pg__phone-screen {
  width: 390px;
  height: min(780px, calc(100dvh - var(--pg-head) - 5rem));
  border: 1px solid var(--color-ink);
  outline: 8px solid var(--color-ink);
  border-radius: 0;
  background: var(--color-bg);
}

.pg__phone-note {
  margin: 0.5rem 0 0;
  color: var(--color-ink-muted);
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pg__foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem 2rem;
  padding: 0.75rem 1.5rem;
  border-top: 1px solid var(--color-ink);
  color: var(--color-ink-muted);
  font-size: var(--text-2xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* A phone or a narrow window: the preview on top, the settings under it. */
@media (max-width: 900px) {
  .pg__main {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto;
    height: auto;
  }

  .pg__preview {
    min-height: 78dvh;
    overflow: visible;
  }

  .pg__panel {
    overflow: visible;
    border-top: 1px solid var(--color-ink);
    border-left: 0;
  }

  .pg__nav {
    margin-left: 0;
  }
}
</style>
