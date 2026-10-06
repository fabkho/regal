<script setup lang="ts">
// Embed (Regal as a Nuxt layer): the 3D Stack for a host page's body, with the
// picked Book's details card over it. Shares the Library, Stack view, Pick and
// hover with RegalBooksSidebar. Give it a size (height) from the host. A
// library file that can't be shown gets an error card instead of the 3D.
//
// Theming (docs/nuxt-layer.md: "Theming"): the tooltip and the detail panel read the
// `--regal-*` tokens, `theme` picks the light/dark set or follows the host,
// `unstyled` leaves only structure and layout, and the slots below replace
// their content (Regal keeps placing, opening, closing and animating them).
import type { Book } from '#layers/regal/shared/types/book'
import type { Face } from '#layers/regal/app/utils/books/pick'
import type { RegalTheme } from '#layers/regal/app/utils/theme/tokens'

const props = withDefaults(defineProps<{
  /** Sort & filter chips over the 3D (off when RegalBooksSidebar shows them). */
  controls?: boolean
  /** Colour scheme of the tooltip and the detail panel; default `runtimeConfig.public.regal.theme` ('light'). */
  theme?: RegalTheme
  /** Structure and minimal layout CSS only: no colours, frame or type of Regal's. */
  unstyled?: boolean
  /**
   * Turning a picked Book with a drag: `'turntable'` (default, as always)
   * turns it left/right and tips it a little; `'free'` spins it about both
   * axes like a trackball, gliding on after a release (RegalBooksRow's default).
   */
  rotate?: 'free' | 'turntable'
}>(), { controls: false, theme: undefined, unstyled: false, rotate: 'turntable' })

defineSlots<{
  /** The tooltip's content (hover and scroll focus label). */
  'tooltip'?: (scope: { book: Book }) => unknown
  /** The whole detail panel's content. */
  'detail'?: (scope: { book: Book, close: () => void, flip: () => void, face: Face, sheet: boolean }) => unknown
  /** The panel's head: series, title, author, rating, meta. */
  'detail-header'?: (scope: { book: Book }) => unknown
  /** The meta line (status, date finished, pages, binding) inside Regal's head. */
  'detail-meta'?: (scope: { book: Book, meta: string[] }) => unknown
  /** The About part (the blurb); also shown for Books without one when passed. */
  'detail-about'?: (scope: { book: Book, description: string | null }) => unknown
  /** Show back / Put back / Goodreads. */
  'detail-actions'?: (scope: { book: Book, close: () => void, flip: () => void, face: Face }) => unknown
}>()

useRegalLibrary()

const root = ref<HTMLElement | null>(null)
const { rootAttrs } = provideRegalUi({
  theme: () => props.theme,
  unstyled: () => props.unstyled,
  root,
  slots: useSlots(),
})
</script>

<template>
  <div
    ref="root"
    v-bind="rootAttrs"
    class="regal-books-stage"
  >
    <LibraryStage
      class="regal-books-stage__stage"
      stack-only
      show-details
      :show-controls="props.controls"
      :rotate="props.rotate"
    />
  </div>
</template>

<style scoped>
.regal-books-stage {
  position: relative;
  display: grid;
  min-height: 24rem;
  color: var(--_regal-ink);
  font-family: var(--_regal-font-body);
  font-size: var(--_regal-size-base);
  line-height: 1.4;
}

.regal-books-stage :deep(*),
.regal-books-stage :deep(*::before),
.regal-books-stage :deep(*::after) {
  box-sizing: border-box;
}

.regal-books-stage__stage {
  min-height: 0;
}
</style>

<style src="../../assets/css/regal-theme.css"></style>
