<script setup lang="ts">
// Dev only (/dev/row-scrollbar): a Libellus-like card (design D "Night
// Reader", dark or light) holding a RegalBooksRow at a phone card's size, the
// way Libellus' Profile would, themed with `--regal-*` tokens, and one scroll
// indicator variant drawn over its bottom from the row's scroll state. The
// row's own indicator is hidden here (scoped override) except for `today`.
import { LIBELLUS, ZONE } from '#layers/regal/app/dev/row-scrollbar/data'
import type { IndicatorVariant } from '#layers/regal/app/dev/row-scrollbar/data'
import { useRowIndicator } from '#layers/regal/app/dev/row-scrollbar/useRowIndicator'

const props = withDefaults(defineProps<{
  scheme: 'dark' | 'light'
  width: number
  height?: number
  variant: IndicatorVariant | 'today'
  unit?: 'month' | 'page'
  /** Behave as under Reduce Motion (the page's switch; the OS setting is read too). */
  reduced?: boolean
}>(), { height: 300, unit: 'month', reduced: false })

const palette = computed(() => LIBELLUS[props.scheme])
/** What a host sets on the row (README: Theming): Libellus' roles under Regal's tokens. */
const tokens = computed(() => ({
  '--regal-surface': palette.value.surface,
  '--regal-surface-raised': palette.value.surface,
  '--regal-ink': palette.value.ink,
  '--regal-ink-muted': palette.value.inkMuted,
  '--regal-ink-faint': palette.value.inkFaint,
  '--regal-accent': palette.value.accent,
  '--regal-hairline': palette.value.hairline,
  '--regal-border': palette.value.border,
  // The row sits unframed in this card; the card is drawn by .rs-card.
  '--regal-border-width': '0px',
  '--regal-radius': '0px',
  '--regal-radius-control': '10px',
  '--regal-shadow': 'none',
  '--regal-font-body': '\'Geist Mono\', ui-monospace, monospace',
  '--regal-font-title': '\'Newsreader\', Georgia, serif',
  '--regal-style-title': 'normal',
  '--regal-size-label': '0.62rem',
  '--regal-label-tracking': '0.1em',
  '--rs-border': palette.value.border,
  '--rs-shadow': palette.value.shadow,
  '--rs-zone': `${ZONE[props.variant]}px`,
  '--i-row': `${props.height - ZONE[props.variant]}px`,
  'width': `${props.width}px`,
  'max-width': '100vw',
  'height': `${props.height}px`,
}))

const host = ref<HTMLElement | null>(null)
const osReduced = usePreferredReducedMotion()
const reduced = computed(() => props.reduced || osReduced.value === 'reduce')
const state = useRowIndicator(host, { reduced })
</script>

<template>
  <div
    ref="host"
    class="rs-card"
    :class="{ 'rs-card--bare': variant !== 'today' }"
    :style="tokens"
  >
    <RegalBooksRow
      class="rs-card__row"
      :theme="scheme"
      inspect="auto"
    />
    <div
      v-if="variant !== 'today'"
      class="rs-card__zone"
    >
      <DevRowIndicator
        :state="state"
        :variant="variant"
        :unit="unit"
      />
    </div>
  </div>
</template>

<style scoped>
.rs-card {
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr) var(--rs-zone);
  flex: none;
  overflow: hidden;
  isolation: isolate;
  box-sizing: border-box;
  border: 1px solid var(--rs-border);
  border-radius: 20px;
  background: var(--regal-surface);
  box-shadow: var(--rs-shadow);
}

.rs-card__row {
  min-height: 0;
}

/* The row gives up height to the indicator; Regal's own 18rem floor would push it out. */
.rs-card :deep(.regal-books-row) {
  min-height: 0;
}

.rs-card__zone {
  position: relative;
}

/* The prototype draws its own: the row's hairline goes. */
.rs-card--bare :deep(.row-card__progress) {
  display: none;
}
</style>
