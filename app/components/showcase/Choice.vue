<script setup lang="ts" generic="T extends string | number | boolean">
// Playground (Regal's own site only): one setting as a row of buttons, one pressed.
defineProps<{
  label: string
  options: readonly { value: T, label: string }[]
  hint?: string
}>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    class="choice"
    role="radiogroup"
    :aria-label="label"
  >
    <span class="choice__label">{{ label }}</span>
    <div class="choice__options">
      <button
        v-for="option in options"
        :key="String(option.value)"
        type="button"
        role="radio"
        class="choice__option"
        :aria-checked="model === option.value"
        @click="model = option.value"
      >
        {{ option.label }}
      </button>
    </div>
    <p
      v-if="hint"
      class="choice__hint"
    >
      {{ hint }}
    </p>
  </div>
</template>

<style scoped>
.choice {
  display: grid;
  gap: 0.35rem;
}

.choice__label {
  color: var(--color-ink-muted);
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.choice__options {
  display: flex;
  flex-wrap: wrap;
}

.choice__option {
  flex: 1 1 auto;
  margin: 0 -1px -1px 0;
  padding: 0.35rem 0.55rem;
  font-size: var(--text-2xs);
}

.choice__option[aria-checked="true"] {
  position: relative;
  border-color: var(--color-ink);
  background: var(--color-ink);
  color: var(--color-bg);
}

.choice__hint {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-2xs);
  line-height: 1.45;
}
</style>
