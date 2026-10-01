<script setup lang="ts">
// Page shell. Scene and Library UI live in their own components so tickets
// can evolve them independently:
// - LibraryStage: 3D Bookcase / Stack views, Pick interaction
// - LibraryPanel: upload, summary, list view (#3)
// - DevChoices (dev only): open design decisions, previewed live
const isDev = import.meta.dev
const { choices } = useDevChoices()
const choicesOpen = useState('dev-choices:open', () => false)
/** Dev preview: the Stack at portfolio-sidebar width next to placeholder content. */
const sidebar = computed(() => isDev && choices.value.sidebarPreview)
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
      :class="{ 'page__main--sidebar': sidebar, 'page__main--choices': isDev && choicesOpen }"
    >
      <article
        v-if="sidebar"
        class="page__mock"
        aria-label="Portfolio placeholder"
      >
        <p class="page__mock-label">
          Portfolio preview
        </p>
        <h2 class="page__mock-title">
          Fabian Kirchhoff
        </h2>
        <p
          v-for="line in 5"
          :key="line"
          class="page__mock-line"
          :style="{ width: `${92 - line * 7}%` }"
        />
      </article>
      <LibraryStage class="page__stage" />
      <LibraryPanel
        v-if="!sidebar"
        class="page__panel"
      />
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

/* Dev: the Stack as a 360 px portfolio sidebar. */
.page__main--sidebar {
  grid-template-columns: 1fr 360px;
}

.page__main--sidebar .page__stage {
  border-left: 1px solid var(--color-ink);
}

.page__mock {
  padding: 3rem 3.5rem;
}

.page__mock-label {
  margin: 0;
  color: var(--color-accent);
  font-size: var(--text-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.page__mock-title {
  margin: 0.6rem 0 2rem;
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 400;
  font-size: var(--text-2xl);
}

.page__mock-line {
  height: 0.7rem;
  margin: 0 0 1rem;
  background: var(--color-line);
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
