<script setup lang="ts">
// Playground (Regal's own site only): the layer's components as a host would
// put them on its page, with the playground's settings as their props, the
// token preset on a wrapper (it reaches the parts Regal moves to <body>) and
// the slots a host could fill. The page owns the Library (playground.vue).
import type { PlaygroundSettings } from '#layers/regal/app/showcase/settings'
import { ROW_SIZES, TOKEN_PRESETS, tokensOf } from '#layers/regal/app/showcase/settings'

const props = defineProps<{ settings: PlaygroundSettings }>()

const tokens = computed(() => tokensOf(props.settings))
const rowSize = computed(() => ROW_SIZES[props.settings.rowSize])
/** The host page behind Regal: paper, or dark where the look is. */
const dark = computed(() => props.settings.theme === 'dark' || (props.settings.theme === 'auto' && props.settings.hostScheme === 'dark'))
const page = computed(() => TOKEN_PRESETS[props.settings.tokens].page ?? (dark.value ? '#15140F' : null))

const stars = (rating: number) => '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating))
const finished = (date: string | null) => (date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : null)
</script>

<template>
  <div
    class="preview"
    :class="{
      'preview--row': settings.component === 'row',
      'preview--dark': dark || settings.tokens === 'night',
      'preview--unstyled': settings.unstyled,
      'preview--sidebar': settings.component === 'stage' && settings.sidebar,
      'preview--bar': settings.component === 'stage' && settings.filterBar,
    }"
    :style="{ ...tokens, ...(page ? { '--preview-page': page } : {}) }"
  >
    <template v-if="settings.component === 'stage'">
      <RegalBooksFilters
        v-if="settings.filterBar"
        class="preview__bar"
      />
      <RegalBooksStage
        class="preview__stage"
        :controls="settings.controls"
        :accessible-list="settings.accessibleList"
        :rotate="settings.stageRotate"
        :theme="settings.theme"
        :unstyled="settings.unstyled"
      >
        <template
          v-if="settings.slots === 'whole'"
          #tooltip="{ book }"
        >
          <span class="host-tooltip"><strong>{{ book.title }}</strong><span v-if="book.author"> — {{ book.author }}</span></span>
        </template>
        <template
          v-if="settings.slots === 'whole'"
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
              {{ book.author }}<span v-if="book.rating"> · {{ stars(book.rating) }}</span>
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
          v-if="settings.slots === 'parts'"
          #detail-header="{ book }"
        >
          <h2 class="host-detail__title">
            {{ book.title }}
          </h2>
          <p class="host-detail__author">
            by {{ book.author ?? 'an unknown author' }} · {{ book.rating ? stars(book.rating) : 'not rated' }}
          </p>
        </template>
        <template
          v-if="settings.slots === 'parts'"
          #detail-about="{ book, description }"
        >
          <p class="host-detail__eyebrow">
            {{ finished(book.dateRead) ? `Finished ${finished(book.dateRead)}` : 'Not finished' }}
          </p>
          <p class="host-detail__blurb">
            {{ description ?? 'No blurb for this one.' }}
          </p>
        </template>
      </RegalBooksStage>
      <RegalBooksSidebar
        v-if="settings.sidebar"
        class="preview__sidebar"
        :class="{ 'preview__sidebar--bar': settings.filterBar }"
        :heading="settings.heading"
        :count-label="settings.countLabel"
        :filters="settings.sidebarFilters"
        :list="settings.sidebarList"
        :theme="settings.theme"
        :unstyled="settings.unstyled"
      />
    </template>

    <figure
      v-else
      class="preview__figure"
    >
      <figcaption class="preview__caption">
        RegalBooksRow · {{ rowSize.label }}
      </figcaption>
      <RegalBooksRow
        :key="`${settings.inspect}-${settings.limit}-${settings.rowYear}`"
        class="preview__row"
        :style="{ width: `min(${rowSize.width}, 100%)`, height: rowSize.height }"
        :inspect="settings.inspect"
        :limit="settings.limit"
        :year="settings.rowYear"
        :rotate="settings.rowRotate"
        :back-button="settings.backButton"
        :accessible-list="settings.accessibleList"
        :label="settings.label"
        :theme="settings.theme"
        :unstyled="settings.unstyled"
      >
        <template
          v-if="settings.slots === 'whole'"
          #tooltip="{ book }"
        >
          <span class="host-tooltip"><strong>{{ book.title }}</strong><span v-if="book.author"> — {{ book.author }}</span></span>
        </template>
        <template
          v-if="settings.slots === 'whole'"
          #detail="{ book, close, flip, face }"
        >
          <div class="host-detail">
            <h2 class="host-detail__title">
              {{ book.title }}
            </h2>
            <p class="host-detail__author">
              {{ book.author }}<span v-if="book.rating"> · {{ stars(book.rating) }}</span>
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
          v-if="settings.slots === 'parts'"
          #detail-header="{ book }"
        >
          <h2 class="host-detail__title">
            {{ book.title }}
          </h2>
        </template>
        <template
          v-if="settings.slots === 'parts'"
          #detail-about="{ description }"
        >
          <p class="host-detail__blurb">
            {{ description ?? 'No blurb for this one.' }}
          </p>
        </template>
      </RegalBooksRow>
      <p class="preview__note">
        Swipe or drag sideways · tap a Book to take it out · Esc or Back puts it away
      </p>
    </figure>
  </div>
</template>

<style scoped>
.preview {
  --preview-page: transparent;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  min-height: 100%;
  background: var(--preview-page);
  transition: background-color 0.2s ease;
}

.preview--sidebar {
  grid-template-columns: minmax(0, 1fr) minmax(16rem, 21rem);
}

.preview--bar {
  grid-template-rows: auto minmax(0, 1fr);
}

.preview__bar {
  grid-column: 1 / -1;
  position: relative;
  z-index: 5;
  border-bottom: 1px solid var(--color-line);
}

.preview__stage {
  min-height: 24rem;
}

.preview__sidebar {
  min-height: 0;
  padding: 1.25rem;
  overflow: auto;
  border-left: 1px solid var(--color-ink);
  background: var(--color-bg);
}

/* With the bar above, the sidebar's own filters would say the same twice (the portfolio hides them). */
.preview__sidebar--bar :deep(.sidebar__filters) {
  display: none;
}

.preview--row {
  place-items: center;
  padding: 2rem 1.5rem;
}

.preview__figure {
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  width: 100%;
  margin: 0;
}

.preview__caption,
.preview__note {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.preview--dark .preview__caption,
.preview--dark .preview__note {
  color: rgba(236, 232, 223, 0.6);
}

.preview--dark .preview__sidebar {
  border-left-color: rgba(236, 232, 223, 0.2);
}

/* A dark host maps the paper-ink tokens too: the sidebar, the filters and the stage's notes read them. */
.preview--dark {
  --color-bg: #15140F;
  --color-ink: #ECE8DF;
  --color-ink-muted: #A8A399;
  --color-ink-subtle: rgba(236, 232, 223, 0.75);
  --color-ink-faint: rgba(236, 232, 223, 0.5);
  --color-line: rgba(236, 232, 223, 0.16);
  --color-accent: #E0705F;
  --color-accent-tint: rgba(224, 112, 95, 0.16);
  color: var(--color-ink);
}

/* Narrow (the phone frame, a phone): the stage a phone's height, the sidebar under it, as a host would. */
@media (max-width: 700px) {
  .preview {
    grid-template-rows: minmax(26rem, 72dvh);
  }

  .preview--bar {
    grid-template-rows: auto minmax(26rem, 72dvh);
  }

  .preview--sidebar {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(26rem, 72dvh) auto;
  }

  .preview--sidebar.preview--bar {
    grid-template-rows: auto minmax(26rem, 72dvh) auto;
  }

  .preview--row {
    grid-template-rows: auto;
    padding: 1.25rem 0.75rem;
  }

  .preview__sidebar {
    border-top: 1px solid var(--color-ink);
    border-left: 0;
  }
}

/* `unstyled`: what the host's own CSS would give the parts (they live in <body> too). */
.preview--unstyled .preview__stage,
.preview--unstyled .preview__row {
  color: #1C2733;
  font-family: system-ui, sans-serif;
}

.preview--unstyled .preview__row {
  border: 1px solid #C8D1DB;
  border-radius: 8px;
  background: #FFF;
}

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

/* The slots' content: the host's own markup, styled by the host. */
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
  color: var(--regal-accent, #B93E2E);
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.host-detail__title {
  margin: 0;
  font-family: Georgia, serif;
  font-size: 1.3rem;
  font-weight: 600;
}

.host-detail__author {
  margin: 0;
  opacity: 0.8;
}

.host-detail__blurb {
  max-height: 7rem;
  margin: 0.4rem 0 0;
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
  letter-spacing: normal;
  text-transform: none;
  cursor: pointer;
}

.host-button--primary {
  border-color: var(--regal-accent, #B93E2E);
  background: var(--regal-accent, #B93E2E);
  color: #FFF;
}
</style>
