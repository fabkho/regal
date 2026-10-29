<script setup lang="ts">
// The reel's first frame as DOM, standing where the canvas will draw it (utils/reel/poster.ts):
// the prototype's CSS 3D scene, the Books on the arc at `focus`, the world at the dolly's
// clock `time`, the same Covers (the canvas's own: the pile copy, else the front), the cloth
// or `assets.color` where a Cover isn't in yet, the floor shadows. It is drawn from the
// server's HTML on, before any script; the canvas fades in over it and it goes (ReelCard).
// A host's fallback (RegalBooksReelStill) shows it as it is. It takes no input.
import type { Book } from '#layers/regal/shared/types/book'
import type { AssetFaces } from '#layers/regal/app/utils/covers/bookAssets'
import { CLOTH_COLORS, hashString } from '#layers/regal/app/utils/bookcase/layout'
import { toHex } from '#layers/regal/app/utils/covers/palette'
import { reelCamera } from '#layers/regal/app/utils/reel/layout'
import { posterBooks, posterWorldTransform } from '#layers/regal/app/utils/reel/poster'
import { REEL_BOOK, REEL_PERSPECTIVE, REEL_SHADOW } from '#layers/regal/app/utils/reel/scene'

const props = withDefaults(defineProps<{
  books: Book[]
  /** A Book's faces from the reel's own Library. */
  facesOf: (bookId: string) => AssetFaces | null
  /** Where the arc stands (Books; the reel's `reelStartFrame`). */
  focus: number
  /** The dolly's clock (ms). */
  time?: number
  /** The floor shadows' strength (0..1): 1 in the light theme, 0 in the dark. */
  shadow?: number
}>(), { time: 0, shadow: 1 })

interface Item {
  id: string
  title: string
  author: string | null
  transform: string
  shadowTransform: string
  shadowOpacity: number
  shade: number
  front: string | null
  color: string
  spineImage: string | undefined
  spine: boolean
  spineColor: string
  spineInk: string
}

/** A URL as a CSS value (quotes and backslashes escaped). */
const cssUrl = (url: string) => `url("${url.replace(/["\\]/g, '\\$&')}")`

const items = computed<Item[]>(() => posterBooks(props.books.length, props.focus).map(({ index, transform, shadowTransform, shadowOpacity, shade }) => {
  const book = props.books[index]!
  const faces = props.facesOf(book.id)
  const color = faces?.flat ? toHex(faces.flat) : CLOTH_COLORS[hashString(book.id) % CLOTH_COLORS.length]!
  const palette = faces?.palette
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    transform,
    shadowTransform,
    shadowOpacity,
    shade,
    front: faces?.pileFront ?? faces?.front ?? null,
    color,
    spineImage: faces?.spine ? cssUrl(faces.spine) : undefined,
    spine: Boolean(faces?.spine),
    spineColor: palette ? toHex(palette.background) : color,
    spineInk: palette ? toHex(palette.text) : '#F5F2EB',
  }
}))

const world = computed(() => posterWorldTransform(reelCamera(props.time)))
const size = {
  '--reel-w': `${REEL_BOOK.width}px`,
  '--reel-h': `${REEL_BOOK.height}px`,
  '--reel-t': `${REEL_BOOK.thickness}px`,
  '--reel-shadow-w': `${REEL_SHADOW.width * REEL_BOOK.width}px`,
  '--reel-shadow-h': `${REEL_SHADOW.depth}px`,
  '--reel-perspective': `${REEL_PERSPECTIVE}px`,
}
</script>

<template>
  <div
    class="reel-poster"
    :style="size"
    aria-hidden="true"
    data-reel-poster
  >
    <div
      class="reel-poster__world"
      :style="{ transform: world }"
    >
      <template
        v-for="item in items"
        :key="item.id"
      >
        <div
          class="reel-poster__shadow"
          :style="{ transform: item.shadowTransform, opacity: item.shadowOpacity * shadow }"
        />
        <div
          class="reel-poster__book"
          :style="{ 'transform': item.transform, '--shade': item.shade }"
          :data-book="item.id"
        >
          <div
            class="reel-poster__face reel-poster__front"
            :style="{ backgroundColor: item.color }"
          >
            <img
              v-if="item.front"
              :src="item.front"
              alt=""
              decoding="async"
              draggable="false"
            >
          </div>
          <div
            class="reel-poster__face reel-poster__back"
            :style="{ backgroundColor: item.color }"
          />
          <div
            class="reel-poster__face reel-poster__spine"
            :style="{
              backgroundColor: item.spineColor,
              backgroundImage: item.spineImage,
              color: item.spineInk,
            }"
          >
            <template v-if="!item.spine">
              <span class="reel-poster__spine-title">{{ item.title }}</span>
              <span
                v-if="item.author"
                class="reel-poster__spine-author"
              >{{ item.author }}</span>
            </template>
          </div>
          <div class="reel-poster__face reel-poster__fore" />
          <div class="reel-poster__face reel-poster__head" />
          <div class="reel-poster__face reel-poster__tail" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* The prototype's stage (base.css .stage): the camera 900 px from the plane, its axis 40 % down. */
.reel-poster {
  position: absolute;
  inset: 0;
  overflow: hidden;
  perspective: var(--reel-perspective, 900px);
  perspective-origin: 50% 40%;
  pointer-events: none;
}

.reel-poster__world {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  transform-style: preserve-3d;
}

.reel-poster__book {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  transform-style: preserve-3d;
}

/* The floor shadow (base.css .shadow): a radial gradient on an ellipse, laid down by its transform. */
.reel-poster__shadow {
  position: absolute;
  top: calc(var(--reel-shadow-h) / -2);
  left: calc(var(--reel-shadow-w) / -2);
  width: var(--reel-shadow-w);
  height: var(--reel-shadow-h);
  border-radius: 50%;
  background: radial-gradient(closest-side, rgb(30 20 10 / 0.28), transparent);
}

/* Every face is centred on the Book's middle and turned out to its place (lib.js makeBook). */
.reel-poster__face {
  position: absolute;
  backface-visibility: hidden;
  /* The canvas's light on a turned Book (utils/reel/poster.ts `posterShade`). */
  filter: brightness(var(--shade, 1));
}

.reel-poster__front,
.reel-poster__back {
  top: calc(var(--reel-h) / -2);
  left: calc(var(--reel-w) / -2);
  width: var(--reel-w);
  height: var(--reel-h);
}

.reel-poster__front {
  transform: translateZ(calc(var(--reel-t) / 2));
}

/* The Cover stretched over the front, as the canvas's texture is. */
.reel-poster__front img {
  display: block;
  width: 100%;
  height: 100%;
}

.reel-poster__back {
  transform: rotateY(180deg) translateZ(calc(var(--reel-t) / 2));
}

.reel-poster__spine {
  top: calc(var(--reel-h) / -2);
  left: calc(var(--reel-t) / -2);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  width: var(--reel-t);
  height: var(--reel-h);
  overflow: hidden;
  background-position: center;
  background-size: 100% 100%;
  transform: rotateY(-90deg) translateZ(calc(var(--reel-w) / 2));
}

/* A typeset Spine: the title down from the head, the author up from the tail (the canvas draws the same two lines). */
.reel-poster__spine-title,
.reel-poster__spine-author {
  max-height: 70%;
  overflow: hidden;
  line-height: 1;
  white-space: nowrap;
  writing-mode: vertical-rl;
}

.reel-poster__spine-title {
  font: 400 13px/1 'Patua One', Georgia, serif;
}

.reel-poster__spine-author {
  max-height: 28%;
  font: 400 9px/1 Antonio, 'Arial Narrow', sans-serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* Page edges: the fore-edge on the right, the head and tail (the canvas's paper, lit). */
.reel-poster__fore,
.reel-poster__head,
.reel-poster__tail {
  background: #B3A58C;
}

.reel-poster__fore {
  top: calc(var(--reel-h) / -2);
  left: calc(var(--reel-t) / -2);
  width: var(--reel-t);
  height: var(--reel-h);
  transform: rotateY(90deg) translateZ(calc(var(--reel-w) / 2));
}

.reel-poster__head,
.reel-poster__tail {
  top: calc(var(--reel-t) / -2);
  left: calc(var(--reel-w) / -2);
  width: var(--reel-w);
  height: var(--reel-t);
}

.reel-poster__head {
  transform: rotateX(90deg) translateZ(calc(var(--reel-h) / 2));
}

.reel-poster__tail {
  transform: rotateX(-90deg) translateZ(calc(var(--reel-h) / 2));
}
</style>
