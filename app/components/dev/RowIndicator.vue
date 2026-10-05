<script setup lang="ts">
// Dev only (/dev/row-scrollbar): one indicator variant over the bottom of a
// RegalBooksRow, from the row's scroll state. Sets the tokens the variants
// read (`--regal-*` with Regal's own fallbacks) and draws nothing when the row
// doesn't scroll (a short row).
import type { IndicatorVariant } from '#layers/regal/app/dev/row-scrollbar/data'
import type { RowIndicatorState } from '#layers/regal/app/dev/row-scrollbar/useRowIndicator'

const props = withDefaults(defineProps<{ state: RowIndicatorState, variant: IndicatorVariant, unit?: 'month' | 'page' }>(), { unit: 'month' })
</script>

<template>
  <div
    v-if="state.scrolls"
    class="ind"
    :class="{ 'ind--reduced': state.reduced }"
  >
    <DevRowIndicatorBar
      v-if="props.variant === 'bar'"
      :state="state"
    />
    <DevRowIndicatorDots
      v-else-if="props.variant === 'dots'"
      :state="state"
      :unit="unit"
    />
    <DevRowIndicatorMonths
      v-else-if="props.variant === 'months'"
      :state="state"
    />
    <DevRowIndicatorMinimap
      v-else-if="props.variant === 'minimap'"
      :state="state"
    />
    <DevRowIndicatorYears
      v-else
      :state="state"
    />
  </div>
</template>

<style scoped>
.ind {
  /* What the variants read: the host's tokens, Regal's own values as fallbacks (README: Theming). */
  --i-ink: var(--regal-ink, #2c2c2a);
  --i-faint: var(--regal-ink-faint, rgba(44, 44, 42, 0.55));
  --i-accent: var(--regal-accent, #b93e2e);
  --i-surface: var(--regal-surface-raised, var(--regal-surface, #f5f2eb));
  --i-track: color-mix(in srgb, var(--i-ink) 14%, transparent);
  --i-font: var(--regal-font-body, 'IBM Plex Mono', 'Courier New', monospace);
  --i-label-size: var(--regal-size-label, 0.65rem);
  --i-label-weight: var(--regal-weight-label, 400);
  --i-tracking: var(--regal-label-tracking, 0.08em);
  --i-case: var(--regal-label-case, uppercase);
  /* Where the row's card ends and the indicator starts: the card's own padding. */
  --i-inset: 14px;

  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
}
</style>
