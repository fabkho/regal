<script setup lang="ts">
// Playground (Regal's own site only): one boolean setting.
defineProps<{ label: string, code?: string }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <label class="toggle">
    <input
      v-model="model"
      type="checkbox"
      class="toggle__input"
    >
    <span
      class="toggle__box"
      aria-hidden="true"
    />
    <span class="toggle__label">{{ label }}</span>
    <code
      v-if="code"
      class="toggle__code"
    >{{ code }}</code>
  </label>
</template>

<style scoped>
.toggle {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: var(--text-xs);
  cursor: pointer;
}

.toggle__input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.toggle__box {
  position: relative;
  flex: none;
  width: 0.85rem;
  height: 0.85rem;
  border: 1px solid var(--color-ink);
}

.toggle__input:checked + .toggle__box::after {
  content: '';
  position: absolute;
  inset: 2px;
  background: var(--color-accent);
}

.toggle__input:focus-visible + .toggle__box {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.toggle__code {
  margin-left: auto;
  color: var(--color-ink-muted);
  font-size: var(--text-2xs);
}
</style>
