<script setup lang="ts">
// Dev only (/dev/row-scrollbar): a Libellus-like card (design D "Night
// Reader", dark or light) holding a RegalBooksRow at a phone card's size, the
// way Libellus' Profile would, themed with `--regal-*` tokens.
import { LIBELLUS } from '#layers/regal/app/dev/row-scrollbar/data'

const props = defineProps<{ scheme: 'dark' | 'light', width: number, height?: number }>()

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
  '--regal-radius': '20px',
  '--regal-radius-control': '10px',
  '--regal-shadow': palette.value.shadow,
  '--regal-font-body': '\'Geist Mono\', ui-monospace, monospace',
  '--regal-font-title': '\'Newsreader\', Georgia, serif',
  '--regal-style-title': 'normal',
  '--regal-size-label': '0.62rem',
  '--regal-label-tracking': '0.1em',
  'width': `${props.width}px`,
  'max-width': '100vw',
  'height': `${props.height ?? 300}px`,
}))
</script>

<template>
  <RegalBooksRow
    class="rs-card"
    :style="tokens"
    :theme="scheme"
    inspect="auto"
  />
</template>
