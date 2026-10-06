<script setup lang="ts">
// Playground (Regal's own site only): the settings, grouped the way a host
// meets them: which component, its props, the look (theme, tokens, slots),
// the library file, and the code a host writes for what is shown.
import type { PlaygroundSettings } from '#layers/regal/app/showcase/settings'
import { ROW_SIZES, TOKEN_PRESETS, configSnippet, styleSnippet, templateSnippet } from '#layers/regal/app/showcase/settings'
import type { StackGrouping } from '#layers/regal/app/utils/stack/view'
import { STACK_GROUPINGS, readYears } from '#layers/regal/app/utils/stack/view'

const props = defineProps<{
  settings: PlaygroundSettings
  /** The library file's URL the host would configure (for the code shown). */
  librarySrc: string
  /** What the shown library is, one line. */
  libraryNote: string
  libraryFailed: boolean
  fileName: string | null
  /** The site's real shelf, if it has one (its label), offered first. */
  liveName: string | null
}>()
const emit = defineEmits<{
  update: [patch: Partial<PlaygroundSettings>]
  file: [file: File]
}>()

/** A v-model for one setting. */
function setting<K extends keyof PlaygroundSettings>(key: K) {
  return computed<PlaygroundSettings[K]>({
    get: () => props.settings[key],
    set: value => emit('update', { [key]: value } as Partial<PlaygroundSettings>),
  })
}

const component = setting('component')
const controls = setting('controls')
const stageRotate = setting('stageRotate')
const sidebar = setting('sidebar')
const sidebarFilters = setting('sidebarFilters')
const sidebarList = setting('sidebarList')
const filterBar = setting('filterBar')
const inspect = setting('inspect')
const rowRotate = setting('rowRotate')
const backButton = setting('backButton')
const rowSize = setting('rowSize')
const theme = setting('theme')
const hostScheme = setting('hostScheme')
const unstyled = setting('unstyled')
const slots = setting('slots')
const haptics = setting('haptics')
const device = setting('device')

function setTokens(value: PlaygroundSettings['tokens']) {
  const preset = TOKEN_PRESETS[value]
  emit('update', { tokens: value, ...(preset.theme ? { theme: preset.theme } : {}) })
}

const { books } = useLibrary()
const years = computed(() => readYears(books.value))
const { view, set: setView } = useStackView()
const group = computed<StackGrouping>({
  get: () => view.value.group,
  set: value => setView({ group: value }),
})

const urlDraft = ref(props.settings.src)
watch(() => props.settings.src, (value) => {
  urlDraft.value = value
})
function loadUrl() {
  const value = urlDraft.value.trim()
  if (value) emit('update', { library: 'url', src: value })
}

const dragging = ref(false)
function drop(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file) emit('file', file)
}
function pickFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('file', file)
  input.value = ''
}

const numberOrNull = (value: string) => {
  const parsed = Number(value)
  return value.trim() && Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const code = computed(() => [
  { title: 'nuxt.config.ts', code: configSnippet(props.settings, props.librarySrc) },
  { title: 'Template', code: templateSnippet(props.settings) },
  { title: 'Style', code: styleSnippet(props.settings) },
])

const onOff = [{ value: true, label: 'On' }, { value: false, label: 'Off' }] as const
const themes = [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'auto', label: 'Auto' }] as const
const rotates = [{ value: 'turntable', label: 'Turntable' }, { value: 'free', label: 'Free' }] as const
</script>

<template>
  <div class="panel">
    <section class="panel__section">
      <h2 class="panel__heading">
        <span class="panel__number">01</span> Component
      </h2>
      <ShowcaseChoice
        v-model="component"
        label="What the host puts on its page"
        :options="[
          { value: 'stage', label: 'Stage (Stack)' },
          { value: 'row', label: 'Row (card)' },
        ]"
        :hint="component === 'stage'
          ? 'RegalBooksStage: the 3D Stack; with RegalBooksSidebar and RegalBooksFilters beside it, all sharing one Pick and the sort & filters.'
          : 'RegalBooksRow: the Stack turned 90° for a card in another page; its own Pick.'"
      />
    </section>

    <section
      v-if="component === 'stage'"
      class="panel__section"
    >
      <h2 class="panel__heading">
        <span class="panel__number">02</span> Stage props
      </h2>
      <ShowcaseToggle
        v-model="controls"
        label="Sort & filter chips over the 3D"
        code="controls"
      />
      <ShowcaseChoice
        v-model="stageRotate"
        label="rotate: dragging a Book taken out"
        :options="rotates"
      />
      <ShowcaseChoice
        v-model="group"
        label="Date separators (?group=, in the URL)"
        :options="STACK_GROUPINGS"
      />
      <ShowcaseToggle
        v-model="filterBar"
        label="RegalBooksFilters above"
        code="<RegalBooksFilters>"
      />
      <ShowcaseToggle
        v-model="sidebar"
        label="RegalBooksSidebar beside"
        code="<RegalBooksSidebar>"
      />
      <div
        v-if="sidebar"
        class="panel__nested"
      >
        <label class="panel__field">
          <span>heading</span>
          <input
            :value="settings.heading"
            type="text"
            placeholder="'' hides it"
            @input="emit('update', { heading: ($event.target as HTMLInputElement).value })"
          >
        </label>
        <label class="panel__field">
          <span>count-label</span>
          <input
            :value="settings.countLabel"
            type="text"
            @input="emit('update', { countLabel: ($event.target as HTMLInputElement).value })"
          >
        </label>
        <ShowcaseToggle
          v-model="sidebarFilters"
          label="Sort & filters"
          code="filters"
        />
        <ShowcaseToggle
          v-model="sidebarList"
          label="The Books as records"
          code="list"
        />
      </div>
      <p class="panel__hint">
        Narrow stages (≤ 560 px) show the details as a bottom sheet: try the phone frame below.
      </p>
    </section>

    <section
      v-else
      class="panel__section"
    >
      <h2 class="panel__heading">
        <span class="panel__number">02</span> Row props
      </h2>
      <ShowcaseChoice
        v-model="inspect"
        label="inspect: where a Book taken out is looked at"
        :options="[
          { value: 'card', label: 'Card' },
          { value: 'viewport', label: 'Viewport' },
          { value: 'auto', label: 'Auto' },
        ]"
        :hint="{
          card: 'The Book comes forward in the card, its details under or beside it.',
          viewport: 'The row breaks out over the whole screen; on a phone the details are a bottom sheet.',
          auto: 'The viewport on narrow screens (≤ 560 px), the card elsewhere.',
        }[inspect]"
      />
      <div class="panel__pair">
        <label class="panel__field">
          <span>limit</span>
          <input
            :value="settings.limit ?? ''"
            type="number"
            min="1"
            placeholder="all"
            @change="emit('update', { limit: numberOrNull(($event.target as HTMLInputElement).value) })"
          >
        </label>
        <label class="panel__field">
          <span>year</span>
          <select
            :value="settings.rowYear ?? ''"
            @change="emit('update', { rowYear: numberOrNull(($event.target as HTMLSelectElement).value) })"
          >
            <option value="">
              all years
            </option>
            <option
              v-for="year in years"
              :key="year"
              :value="year"
            >
              {{ year }}
            </option>
          </select>
        </label>
      </div>
      <ShowcaseChoice
        v-model="rowRotate"
        label="rotate"
        :options="[{ value: 'free', label: 'Free' }, { value: 'turntable', label: 'Turntable' }]"
      />
      <ShowcaseChoice
        v-model="backButton"
        label="back-button"
        :options="onOff"
      />
      <label class="panel__field">
        <span>label (accessible name)</span>
        <input
          :value="settings.label"
          type="text"
          placeholder="Books read"
          @input="emit('update', { label: ($event.target as HTMLInputElement).value })"
        >
      </label>
      <ShowcaseChoice
        v-model="rowSize"
        label="The host's card"
        :options="[
          { value: 'phone', label: ROW_SIZES.phone.label },
          { value: 'wide', label: ROW_SIZES.wide.label },
        ]"
      />
    </section>

    <section class="panel__section">
      <h2 class="panel__heading">
        <span class="panel__number">03</span> Look
      </h2>
      <ShowcaseChoice
        v-model="theme"
        label="theme"
        :options="themes"
      />
      <ShowcaseChoice
        v-if="theme === 'auto'"
        v-model="hostScheme"
        label="The host's own scheme (html data-theme)"
        :options="[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]"
        hint="Auto follows the nearest data-theme, a dark/light class, color-scheme, else the OS."
      />
      <ShowcaseChoice
        :model-value="settings.tokens"
        label="Theme tokens (--regal-*)"
        :options="(Object.keys(TOKEN_PRESETS) as (keyof typeof TOKEN_PRESETS)[]).map(key => ({ value: key, label: TOKEN_PRESETS[key].label }))"
        :hint="TOKEN_PRESETS[settings.tokens].note"
        @update:model-value="setTokens"
      />
      <div class="panel__pair">
        <label class="panel__field">
          <span>--regal-accent</span>
          <span class="panel__colour">
            <input
              :value="settings.accent ?? '#b93e2e'"
              type="color"
              @input="emit('update', { accent: ($event.target as HTMLInputElement).value })"
            >
            <button
              v-if="settings.accent"
              type="button"
              class="panel__reset"
              @click="emit('update', { accent: null })"
            >
              Reset
            </button>
          </span>
        </label>
        <label class="panel__field">
          <span>--regal-radius {{ settings.radius === null ? '' : `${settings.radius}px` }}</span>
          <input
            :value="settings.radius ?? 0"
            type="range"
            min="0"
            max="24"
            @input="emit('update', { radius: Number(($event.target as HTMLInputElement).value) })"
          >
        </label>
      </div>
      <ShowcaseChoice
        v-model="slots"
        label="Slots: the host's own markup inside Regal's frame"
        :options="[
          { value: 'none', label: 'None' },
          { value: 'whole', label: '#tooltip + #detail' },
          { value: 'parts', label: '#detail-header/-about' },
        ]"
      />
      <ShowcaseToggle
        v-model="unstyled"
        label="Structure only, the host styles it"
        code="unstyled"
      />
    </section>

    <section class="panel__section">
      <h2 class="panel__heading">
        <span class="panel__number">04</span> Library file
      </h2>
      <ShowcaseChoice
        :model-value="settings.library"
        label="librarySrc"
        :options="[
          ...(liveName ? [{ value: 'live' as const, label: liveName }] : []),
          { value: 'shelf', label: 'Showcase shelf' },
          { value: 'demo', label: 'Demo' },
          { value: 'url', label: 'URL' },
          { value: 'file', label: 'Your file' },
        ]"
        @update:model-value="value => value === 'url' ? emit('update', { library: 'url', src: settings.src || urlDraft }) : emit('update', { library: value })"
      />
      <form
        v-if="settings.library === 'url'"
        class="panel__url"
        @submit.prevent="loadUrl"
      >
        <input
          v-model="urlDraft"
          type="url"
          placeholder="https://…/library.json"
          aria-label="Library file URL"
        >
        <button type="submit">
          Load
        </button>
      </form>
      <label
        v-if="settings.library === 'file'"
        class="panel__drop"
        :class="{ 'panel__drop--over': dragging }"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="drop"
      >
        <input
          type="file"
          accept=".json,application/json"
          class="panel__file"
          @change="pickFile"
        >
        <span>{{ fileName ? `Shown: ${fileName}` : 'Drop a Regal library file here' }}</span>
        <span class="panel__hint">or click to choose one · read in this tab only, never uploaded or kept</span>
      </label>
      <p
        class="panel__status"
        :class="{ 'panel__status--error': libraryFailed }"
      >
        {{ libraryNote }}
      </p>
      <p class="panel__hint">
        Format: <a
          href="https://github.com/fabkho/regal/blob/main/docs/library-file.md"
          target="_blank"
          rel="noopener"
        >the Regal library file ↗</a>. Images on another origin need CORS (they become WebGL textures); relative ones resolve against the file's URL, so a dropped file shows drawn faces for them.
      </p>
    </section>

    <section class="panel__section panel__section--desktop">
      <h2 class="panel__heading">
        <span class="panel__number">05</span> Viewport
      </h2>
      <ShowcaseChoice
        v-model="device"
        label="Preview"
        :options="[{ value: 'desktop', label: 'This window' }, { value: 'phone', label: 'Phone 390 × 780' }]"
        hint="The phone frame is this page at a phone's width: the bottom sheet, the filter bar, the row breaking out."
      />
    </section>

    <section class="panel__section">
      <h2 class="panel__heading">
        <span class="panel__number">06</span> Host code
      </h2>
      <ShowcaseChoice
        v-model="haptics"
        label="haptics (host config only)"
        :options="onOff"
        hint="Runtime config, not a prop: it changes the code below, not this page. Short vibrations on phones that can (Android Chrome)."
      />
      <ShowcaseCode
        v-for="block in code"
        :key="block.title"
        :title="block.title"
        :code="block.code"
      />
      <p class="panel__hint">
        Everything else: <a
          href="https://github.com/fabkho/regal#use-regal-as-a-nuxt-layer"
          target="_blank"
          rel="noopener"
        >the README ↗</a>.
      </p>
    </section>
  </div>
</template>

<style scoped>
.panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
}

.panel__section {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.8rem;
  padding: 1.1rem 1.25rem 1.3rem;
  border-bottom: 1px solid var(--color-ink);
}

.panel__heading {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  margin: 0;
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.panel__number {
  color: var(--color-accent);
}

.panel__nested {
  display: grid;
  gap: 0.6rem;
  padding-left: 0.9rem;
  border-left: 1px solid var(--color-line);
}

.panel__pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.8rem;
}

.panel__field {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
}

.panel__field > span:first-child {
  color: var(--color-ink-muted);
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.panel input[type="text"],
.panel input[type="url"],
.panel input[type="number"],
.panel select {
  width: 100%;
  min-width: 0;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--color-ink);
  border-radius: 0;
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--text-xs);
}

.panel input[type="range"] {
  width: 100%;
  accent-color: var(--color-accent);
}

.panel__colour {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.panel input[type="color"] {
  width: 2.2rem;
  height: 1.7rem;
  padding: 0;
  border: 1px solid var(--color-ink);
  background: transparent;
}

.panel__reset {
  padding: 0.2rem 0.45rem;
  font-size: var(--text-2xs);
}

.panel__url {
  display: flex;
}

.panel__url button {
  margin-left: -1px;
}

.panel__drop {
  display: grid;
  gap: 0.3rem;
  place-items: center;
  padding: 1.1rem 0.75rem;
  border: 1px dashed var(--color-ink);
  font-size: var(--text-xs);
  letter-spacing: 0.04em;
  text-align: center;
  text-transform: uppercase;
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.panel__drop:hover,
.panel__drop--over {
  background: var(--color-accent-tint);
}

.panel__drop:focus-within {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.panel__file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.panel__status {
  margin: 0;
  font-size: var(--text-xs);
}

.panel__status--error {
  color: var(--color-accent);
}

.panel__hint {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-2xs);
  line-height: 1.45;
  text-transform: none;
  letter-spacing: normal;
}

/* A visitor on a phone is in the phone already. */
@media (max-width: 900px) {
  .panel__section--desktop {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel__drop {
    transition: none;
  }
}
</style>
