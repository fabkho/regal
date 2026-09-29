<script setup lang="ts">
// The 3D Bookcase stage. WebGL only runs in the browser, so the canvas is
// client-only and the server renders the fallback below it.
// The Library is laid out onto the Shelves here; extra scene content can
// still come in through the default slot, which lands in the "books" group.
import { ACESFilmicToneMapping, SRGBColorSpace, VSMShadowMap } from 'three'
import { TONE_MAPPING_EXPOSURE } from '~/utils/bookcase/scene'
import { layoutLibrary } from '~/utils/bookcase/layout'

const route = useRoute()
/** Dev-only: ?debug=slots draws a box on every measured ShelfSlot. */
const debugSlots = computed(() => String(route.query.debug ?? '').split(',').includes('slots'))

const { books } = useLibrary()
const layout = computed(() => layoutLibrary(books.value))

const isReady = ref(false)
</script>

<template>
  <section
    class="stage"
    aria-label="Bookcase"
    :data-book-count="layout.placements.length"
    :data-bookcase-count="layout.bookcaseCount"
  >
    <ClientOnly>
      <TresCanvas
        class="stage__canvas"
        :alpha="true"
        :clear-alpha="0"
        shadows
        :shadow-map-type="VSMShadowMap"
        :tone-mapping="ACESFilmicToneMapping"
        :tone-mapping-exposure="TONE_MAPPING_EXPOSURE"
        :output-color-space="SRGBColorSpace"
        :dpr="[1, 2]"
      >
        <BookcaseScene
          :debug-slots="debugSlots"
          :bookcase-count="layout.bookcaseCount"
          @loaded="isReady = true"
        >
          <BookcaseBooks
            :placements="layout.placements"
            :books="books"
          />
          <slot />
        </BookcaseScene>
      </TresCanvas>

      <template #fallback>
        <p class="stage__status">
          Loading the bookcase…
        </p>
      </template>
    </ClientOnly>

    <p
      v-show="!isReady"
      class="stage__status stage__status--overlay"
      aria-live="polite"
    >
      Loading the bookcase…
    </p>
  </section>
</template>

<style scoped>
.stage {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.stage__canvas {
  position: absolute;
  inset: 0;
}

.stage__status {
  margin: 0;
  color: var(--color-ink-faint);
  font-size: var(--text-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.stage__status--overlay {
  position: absolute;
  pointer-events: none;
}
</style>
