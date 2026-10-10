<script setup lang="ts">
// PROTOTYPE (Libellus' "Pick my next book", fabkho/libellus#259): a 3D "pick
// one of these Books" shuffle. The host decides the winner (`winner`, an index
// into `books`, drawn however it likes: Regal never picks); this plays a 3-5 s
// shuffle that ends with that Book standing face to the camera, and says where
// its front cover rests (`picked`) so the host can lay its own cover exactly
// there and fly it to its page.
//
// Three variants share a start (the covers come in as a hand of cards) and an
// end (the winner upright, 55 % of the stage tall): `deck` shuffles like cards
// (riffle, riffle, cut), `stack` is Regal's Stack re-sorting and riffling
// until the winner stops in the middle, `wheel` is a carousel slowing to a
// fixed pointer. Props are read when the component is mounted: to deal again
// give it a new `key`. docs/nuxt-layer.md: "RegalBooksDeal".
import { ACESFilmicToneMapping, SRGBColorSpace, VSMShadowMap } from 'three'
import type { DealBook, DealPicked, DealVariant } from '#layers/regal/app/utils/deal/book'
import { DEAL_MAX_BOOKS } from '#layers/regal/app/utils/deal/book'
import type { RegalTheme } from '#layers/regal/app/utils/theme/tokens'
import { TONE_MAPPING_EXPOSURE } from '#layers/regal/app/utils/bookcase/scene'

export type { DealBook, DealPicked, DealVariant }

const props = withDefaults(defineProps<{
  /** The candidates (2-12; one is allowed and just presented). */
  books: DealBook[]
  /** Index into `books`, decided by the host (crypto.getRandomValues). */
  winner: number
  /** `deck`, `stack` or `wheel`. */
  variant?: DealVariant
  /** The shuffle part in ms (the host passes about 2200 for later rounds). */
  duration?: number
  /** No shuffle: the winner fades in where it ends up. Default: follows `prefers-reduced-motion`. */
  reducedMotion?: boolean
  /** Colour scheme as the other components (the pointer takes the theme's accent). */
  theme?: RegalTheme
  /** What the region is, for assistive technology (the host gives the words). */
  label?: string
  /** Varies the look only (the riffle's order, wobbles), never the winner. Default: random. For a repeatable look in tests. */
  seed?: number
}>(), { variant: 'deck', duration: 4000, reducedMotion: undefined, theme: undefined, label: '', seed: undefined })

const emit = defineEmits<{
  /** The covers are in, the first frame is drawn, the motion starts now. */
  ready: []
  /** Once, at the end (also after a skip, also with reduced motion): the winner's front cover in viewport CSS px. */
  picked: [picked: DealPicked]
}>()

const root = ref<HTMLElement | null>(null)
const scene = ref<{ skip: () => void } | null>(null)
const quality = useRenderQuality()
const dpr = computed<[number, number]>(() => [1, quality.value.maxDpr])

const { rootAttrs } = provideRegalUi({
  theme: () => props.theme,
  unstyled: () => false,
  root,
})

/** What the host asked for, or the visitor's preference. */
function reduced(): boolean {
  if (props.reducedMotion !== undefined) return props.reducedMotion
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

const valid = computed(() => props.books.length >= 1 && Number.isInteger(props.winner) && props.winner >= 0 && props.winner < props.books.length)
if (import.meta.dev) {
  if (!valid.value) console.warn('[RegalBooksDeal] `winner` must be an index into `books`; nothing is dealt.')
  else if (props.books.length > DEAL_MAX_BOOKS) console.warn(`[RegalBooksDeal] made for up to ${DEAL_MAX_BOOKS} Books, got ${props.books.length}.`)
}

/** Jump to the end pose (a ~180 ms settle) and emit `picked`. */
function skip() {
  scene.value?.skip()
}

defineExpose({ skip })
</script>

<template>
  <div
    ref="root"
    v-bind="rootAttrs"
    class="regal-books-deal"
    role="img"
    :aria-label="label || undefined"
    @pointerup="skip"
  >
    <ClientOnly>
      <TresCanvas
        v-if="valid"
        class="regal-books-deal__canvas"
        aria-hidden="true"
        :alpha="true"
        :clear-alpha="0"
        :premultiplied-alpha="true"
        :shadows="quality.tier === 'desktop'"
        :shadow-map-type="VSMShadowMap"
        :tone-mapping="ACESFilmicToneMapping"
        :tone-mapping-exposure="TONE_MAPPING_EXPOSURE"
        :output-color-space="SRGBColorSpace"
        :dpr="dpr"
      >
        <DealScene
          ref="scene"
          :books="books"
          :winner="winner"
          :variant="variant"
          :duration="duration"
          :reduced="reduced()"
          :seed="seed"
          @ready="emit('ready')"
          @picked="emit('picked', $event)"
        />
      </TresCanvas>
    </ClientOnly>
  </div>
</template>

<style scoped>
.regal-books-deal {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.regal-books-deal__canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}
</style>

<style src="../../assets/css/regal-theme.css"></style>
