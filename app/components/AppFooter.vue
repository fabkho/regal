<script setup lang="ts">
// The site's real shelf (REGAL_SITE_SHELF_SRC, nuxt.config.ts) shows real
// covers and blurbs: say whose they are while it is the Library shown.
const site = useRuntimeConfig().public.regalSite as { shelfSrc: string, shelfName: string } | undefined
const library = useLibrary()
const showsShelf = computed(() => Boolean(site?.shelfSrc) && library.source.value?.src === site?.shelfSrc)
</script>

<template>
  <footer class="footer">
    <span>
      Bookcase model:
      <a
        href="https://sketchfab.com/3d-models/antique-wooden-bookcase-game-model-75aa9519195647d99cf1e2d4863dbe87"
        target="_blank"
        rel="noopener"
      >“Antique wooden bookcase” ↗</a>
      by Lorenzo Drago ·
      <a
        href="https://creativecommons.org/licenses/by/4.0/"
        target="_blank"
        rel="noopener"
      >CC BY 4.0 ↗</a>
      (modified)
    </span>
    <span v-if="showsShelf">
      {{ site!.shelfName }}, live from its published library file · covers and blurbs belong to their publishers and authors
    </span>
    <span>
      Shows a
      <a
        href="https://github.com/fabkho/regal/blob/main/docs/library-file.md"
        target="_blank"
        rel="noopener"
      >Regal library file ↗</a>
      · <code>?src=</code> views yours
    </span>
  </footer>
</template>

<style scoped>
.footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem 2rem;
  padding: 0.75rem 1.5rem;
  border-top: 1px solid var(--color-ink, #2C2C2A);
  color: var(--color-ink-muted, #6B6B69);
  font-size: var(--text-2xs, 0.65rem);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.footer code {
  font: inherit;
  text-transform: none;
}
</style>
