<script setup lang="ts">
// Regal's own site: a viewer of one Regal library file. Scene and Library UI
// live in their own components so tickets can evolve them independently:
// - LibraryStage: 3D Bookcase / Stack views, Pick interaction
// - LibraryPanel: owner, summary, list view
// - DevChoices (dev only): links that play the decided transitions
//
// Shows `librarySrc` (the demo library unless configured otherwise);
// `?src=<url>` views any library file. A visitor's URL loads in the browser
// only, never through the server.
const isDev = import.meta.dev
const choicesOpen = useState('dev-choices:open', () => false)

const route = useRoute()
const visitorSrc = computed(() => {
  const value = route.query.src
  return typeof value === 'string' && value.trim() ? value.trim() : null
})
useRegalLibrary(visitorSrc, { server: !visitorSrc.value })
</script>

<template>
  <div class="page">
    <header class="page__header">
      <h1 class="page__title">
        Regal
      </h1>
      <p class="page__tagline">
        Your reading, as a bookcase.
      </p>
      <NuxtLink
        to="/playground"
        class="page__link"
      >
        Playground: every setting of the layer →
      </NuxtLink>
    </header>

    <main
      class="page__main"
      :class="{ 'page__main--choices': isDev && choicesOpen }"
    >
      <LibraryStage class="page__stage" />
      <LibraryPanel class="page__panel" />
    </main>

    <DevChoices v-if="isDev" />

    <AppFooter />
  </div>
</template>

<style scoped>
.page {
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr auto;
}

.page__header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--color-ink);
}

.page__title {
  margin: 0;
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 400;
  font-size: var(--text-2xl);
}

.page__tagline {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.page__link {
  margin-left: auto;
  font-size: var(--text-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.page__main {
  display: grid;
  grid-template-columns: 1fr minmax(18rem, 24rem);
  min-height: 0;
}

.page__stage {
  min-height: 70dvh;
}

.page__panel {
  border-left: 1px solid var(--color-ink);
}

/* Dev: leave room for the choices drawer. */
.page__main--choices {
  padding-right: min(30rem, 100vw);
}

.page__main--choices .page__panel {
  display: none;
}

.page__main--choices:not(.page__main--sidebar) {
  grid-template-columns: 1fr;
}

@media (max-width: 900px) {
  .page__main {
    grid-template-columns: 1fr;
  }

  .page__panel {
    border-left: 0;
    border-top: 1px solid var(--color-ink);
  }
}
</style>
