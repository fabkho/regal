<script setup lang="ts">
// Embed (Regal as a Nuxt layer): the text side of a host's Books page, for its
// sidebar: count of read Books, the Stack's sort & filters and the Books as
// records (hover lifts a Book in RegalBooksStage, click takes it out). The
// picked Book's detail panel in it takes `theme`, `unstyled` and the #detail
// slots like RegalBooksStage's (docs/nuxt-layer.md: "Theming").
import type { Book } from '#layers/regal/shared/types/book'
import type { Face } from '#layers/regal/app/utils/books/pick'
import type { RegalTheme } from '#layers/regal/app/utils/theme/tokens'

const props = withDefaults(defineProps<{
  /** Header line, like the host's other sidebars; '' hides it. */
  heading?: string
  /** Under the count: "12 / books read". */
  countLabel?: string
  /** The sort & filter groups. */
  filters?: boolean
  /** The Books as records. */
  list?: boolean
  /** Colour scheme of the detail panel; default `runtimeConfig.public.regal.theme` ('light'). */
  theme?: RegalTheme
  /** The detail panel without Regal's colours, frame and type. */
  unstyled?: boolean
}>(), { heading: 'Bookshelf', countLabel: 'Books read', filters: true, list: true, theme: undefined, unstyled: false })

defineSlots<{
  'detail'?: (scope: { book: Book, close: () => void, flip: () => void, face: Face, sheet: boolean }) => unknown
  'detail-header'?: (scope: { book: Book }) => unknown
  'detail-meta'?: (scope: { book: Book, meta: string[] }) => unknown
  'detail-about'?: (scope: { book: Book, description: string | null }) => unknown
  'detail-actions'?: (scope: { book: Book, close: () => void, flip: () => void, face: Face }) => unknown
}>()

useRegalLibrary()

const root = ref<{ $el: HTMLElement } | null>(null)
provideRegalUi({
  theme: () => props.theme,
  unstyled: () => props.unstyled,
  root: computed(() => root.value?.$el ?? null),
  slots: useSlots(),
})
</script>

<template>
  <LibrarySidebar
    ref="root"
    class="regal-books-sidebar"
    :heading="props.heading"
    :count-label="props.countLabel"
    :filters="props.filters"
    :list="props.list"
  />
</template>

<style scoped>
.regal-books-sidebar {
  color: var(--color-ink, #2C2C2A);
  font-family: var(--font-mono, 'IBM Plex Mono', 'Courier New', Courier, monospace);
  font-size: var(--text-base, 0.85rem);
  line-height: 1.4;
}

.regal-books-sidebar :deep(*),
.regal-books-sidebar :deep(*::before),
.regal-books-sidebar :deep(*::after) {
  box-sizing: border-box;
}
</style>
