<script setup lang="ts">
const emit = defineEmits<{
  file: [file: File]
}>()

const isDragging = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

function openPicker() {
  fileInput.value?.click()
}

function onInputChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) emit('file', file)
  target.value = ''
}

function onDrop(event: DragEvent) {
  isDragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) emit('file', file)
}

function onDragOver() {
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}
</script>

<template>
  <div
    class="dropzone"
    :class="{ 'dropzone--active': isDragging }"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <p class="dropzone__label">
      Drop your library export here
    </p>
    <p class="dropzone__hint">
      goodreads_library_export.csv
    </p>
    <div class="dropzone__actions">
      <button
        type="button"
        class="btn"
        @click="openPicker"
      >
        Choose file
      </button>
      <slot name="actions" />
    </div>
    <input
      ref="fileInput"
      type="file"
      accept=".csv,text/csv"
      class="sr-only"
      @change="onInputChange"
    >
  </div>
</template>

<style scoped>
.dropzone {
  border: 1px dashed var(--color-line);
  padding: 1.25rem 1rem;
  text-align: center;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.dropzone--active {
  border-color: var(--color-accent);
  background-color: var(--color-accent-tint);
}

.dropzone__label {
  margin: 0 0 0.25rem;
  font-size: var(--text-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.dropzone__hint {
  margin: 0 0 0.85rem;
  color: var(--color-ink-faint);
  font-size: var(--text-xs);
}

.dropzone__actions {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
}
</style>
