<script setup lang="ts">
// Playground (Regal's own site only): a piece of host code with a copy button.
const props = defineProps<{ title: string, code: string }>()
const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
async function copy() {
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (copied.value = false), 1400)
  }
  catch {
    // No clipboard (insecure origin): the code stays selectable.
  }
}
</script>

<template>
  <figure class="code">
    <figcaption class="code__head">
      <span>{{ title }}</span>
      <button
        type="button"
        class="code__copy"
        @click="copy"
      >
        {{ copied ? 'Copied' : 'Copy' }}
      </button>
    </figcaption>
    <pre class="code__body"><code>{{ code }}</code></pre>
  </figure>
</template>

<style scoped>
.code {
  margin: 0;
  border: 1px solid var(--color-ink);
}

.code__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 0 0.6rem;
  border-bottom: 1px solid var(--color-ink);
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.code__copy {
  margin: -1px -1px -1px 0;
  padding: 0.25rem 0.6rem;
  font-size: var(--text-2xs);
}

.code__body {
  margin: 0;
  padding: 0.6rem;
  overflow-x: auto;
  font-size: 0.68rem;
  line-height: 1.5;
  white-space: pre;
}
</style>
