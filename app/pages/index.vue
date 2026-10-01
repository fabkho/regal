<script setup lang="ts">
// Page shell. Scene and Library UI live in their own components so tickets
// can evolve them independently:
// - LibraryStage: 3D Bookcase / Stack views, Pick interaction
// - LibraryPanel: upload, summary, list view (#3)
// - DevChoices (dev only): open design decisions, previewed live
const isDev = import.meta.dev
const choicesOpen = useState('dev-choices:open', () => false)
</script>

<template>
  <div class="page">
    <header class="page__header">
      <h1 class="page__title">
        Regal
      </h1>
      <p class="page__tagline">
        Your Goodreads library, as a bookcase.
      </p>
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
