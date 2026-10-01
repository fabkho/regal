<script setup lang="ts">
// Page shell. Scene and Library UI live in their own components so tickets
// can evolve them independently:
// - LibraryStage: 3D Bookcase / Stack views, Pick interaction
// - LibraryPanel: upload, summary, list view (#3)
// - DevChoices (dev only): open design decisions, previewed live
const isDev = import.meta.dev
const { choices } = useDevChoices()
const choicesOpen = useState('dev-choices:open', () => false)
/** Dev preview of the portfolio Books page: the 3D Stack in the body, text in a 320 px sidebar. */
const pagePreview = computed(() => isDev && choices.value.pagePreview)
const layout = computed(() => choices.value.pageLayout)
const bodyTab = ref<'3d' | 'list'>('3d')
</script>

<template>
  <div
    v-if="pagePreview"
    class="board"
    :class="{ 'board--choices': choicesOpen }"
  >
    <header class="board__header">
      <span class="board__logo">fabkho</span>
      <nav class="board__nav">
        <span>About</span><span>Projects</span><span>Blog</span><span class="board__nav-active">Books</span>
      </nav>
    </header>
    <main class="board__main">
      <div class="board__intro">
        <p class="board__label">
          Portfolio preview · /books
        </p>
        <h1 class="board__title">
          Bookshelf
        </h1>
        <div
          v-if="layout === 'sidebar-filters'"
          class="board__tabs"
          role="group"
          aria-label="Show as"
        >
          <button
            type="button"
            :aria-pressed="bodyTab === '3d'"
            @click="bodyTab = '3d'"
          >
            Stack
          </button>
          <button
            type="button"
            :aria-pressed="bodyTab === 'list'"
            @click="bodyTab = 'list'"
          >
            List
          </button>
        </div>
      </div>
      <LibraryStage
        v-show="layout !== 'sidebar-filters' || bodyTab === '3d'"
        class="board__stage"
        stack-only
        :show-controls="layout === 'sidebar-list'"
        :show-details="choices.details === 'overlay'"
      />
      <LibraryRecords
        v-if="layout === 'sidebar-filters' && bodyTab === 'list'"
        class="board__records"
      />
    </main>
    <aside class="board__sidebar">
      <LibrarySidebar
        :filters="layout !== 'sidebar-list'"
        :list="layout !== 'sidebar-filters'"
        :details="choices.details === 'sidebar'"
      />
    </aside>
    <DevChoices />
  </div>

  <div
    v-else
    class="page"
  >
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

/* Dev: portfolio /books page preview (grid as in ~/code/portfolio: board 1400 px, body + 320 px sidebar). */
.board {
  display: grid;
  grid-template-columns: 1fr 320px;
  grid-template-rows: auto 1fr;
  max-width: 1400px;
  height: 100dvh;
  margin: 0 auto;
  border-left: 1px solid var(--color-ink);
  border-right: 1px solid var(--color-ink);
}

.board--choices {
  margin-right: min(30rem, 100vw);
  margin-left: 0;
}

.board__header {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--color-ink);
}

.board__logo {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: var(--text-xl, 1.4rem);
}

.board__nav {
  display: flex;
  gap: 1.5rem;
  color: var(--color-ink-muted);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.board__nav-active {
  color: var(--color-accent);
}

.board__main {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.board__intro {
  display: flex;
  align-items: baseline;
  gap: 1.5rem;
  padding: 1.2rem 1.5rem 0;
}

.board__label {
  margin: 0;
  color: var(--color-accent);
  font-size: var(--text-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.board__title {
  margin: 0;
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 400;
  font-size: var(--text-2xl);
}

.board__tabs {
  display: flex;
  margin-left: auto;
  border: 1px solid var(--color-ink);
}

.board__tabs button {
  padding: 0.3rem 0.8rem;
  font: inherit;
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-ink-muted);
  background: transparent;
  border: 0;
  cursor: pointer;
}

.board__tabs button[aria-pressed='true'] {
  color: var(--color-bg);
  background: var(--color-ink);
}

.board__stage {
  flex: 1;
  min-height: 0;
}

.board__records {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.5rem;
}

.board__sidebar {
  min-height: 0;
  border-left: 1px solid var(--color-ink);
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
