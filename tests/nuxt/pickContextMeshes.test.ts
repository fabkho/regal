// BooksMeshes (the 3D Books of the Stack/Bookcase) on a provided Pick context:
// Escape puts away the picked Book of its own context only. The Tres canvas is
// replaced by a stand-in (no WebGL in the test environment), so the component
// mounts as plain DOM and runs its setup, its listeners and its Pick logic.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import { BooksMeshes } from '#components'
import { useState } from '#imports'
import { createPickContext } from '#layers/regal/app/utils/books/pickContext'
import type { PickContext } from '#layers/regal/app/utils/books/pickContext'
import { providePickContext, useBookPick } from '#layers/regal/app/composables/useBookPick'

vi.mock('@tresjs/core', async (importOriginal) => {
  const { Vector3 } = await import('three')
  const original = await importOriginal<Record<string, unknown>>()
  const canvas = document.createElement('canvas')
  return {
    ...original,
    useTres: () => ({
      camera: shallowRef({ position: new Vector3(), quaternion: {}, fov: 40, aspect: 1, projectionMatrix: {}, matrixWorldInverse: {} }),
      controls: shallowRef(null),
      renderer: { domElement: canvas },
      sizes: { width: shallowRef(800), height: shallowRef(600) },
      invalidate: () => {},
    }),
    useLoop: () => ({ onBeforeRender: () => ({ off: () => {} }), onAfterRender: () => ({ off: () => {} }) }),
  }
})

const mounted: Array<{ unmount: () => void }> = []
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

function mountMeshes(context?: PickContext) {
  const Host = defineComponent({
    setup() {
      if (context) providePickContext(context)
      return () => h(BooksMeshes, { poses: [], books: [] })
    },
  })
  return mountSuspended(Host).then((wrapper) => {
    mounted.push(wrapper)
    return wrapper
  })
}

const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

describe('BooksMeshes on a Pick context', () => {
  it('Escape puts away the picked Book of the context it runs in, not the shared one', async () => {
    const reel = createPickContext()
    useState('book-pick').value = { bookId: 'shared', face: 'front' }
    reel.state.value = { bookId: 'hers', face: 'front' }
    await mountMeshes(reel)
    escape()
    await nextTick()
    expect(reel.state.value.bookId).toBeNull()
    expect(useState<{ bookId: string | null }>('book-pick').value.bookId).toBe('shared')
  })

  it('on the shared Pick Escape puts away the shared Book and leaves a reel\'s alone', async () => {
    const reel = createPickContext()
    useState('book-pick').value = { bookId: 'shared', face: 'front' }
    reel.state.value = { bookId: 'hers', face: 'front' }
    await mountMeshes()
    escape()
    await nextTick()
    expect(useState<{ bookId: string | null }>('book-pick').value.bookId).toBeNull()
    expect(reel.state.value.bookId).toBe('hers')
  })

  it('putAway from the context\'s own Pick API runs only its listeners', async () => {
    const reel = createPickContext()
    const seen: string[] = []
    reel.beforeChange.add((previous, next) => seen.push(`${previous}>${next}`))
    reel.state.value = { bookId: 'hers', face: 'front' }
    await mountMeshes(reel)
    useBookPick(reel).putAway()
    expect(seen).toEqual(['hers>null'])
  })
})
