import { Fragment, h } from 'vue'
import type { VNode } from 'vue'

// Renders one of the host's slots for the tooltip / detail panel (passed to
// RegalBooksStage or RegalBooksSidebar, composables/useRegalUi.ts) with
// `scope`, or this component's own default slot (Regal's markup) when the host
// didn't pass it.
export default defineComponent({
  name: 'BooksHostSlot',
  props: {
    /** The host slot's name (`tooltip`, `detail`, `detail-header` …). */
    name: { type: String, required: true },
    /** What the slot gets (`{ book }`, `{ book, close }` …). */
    scope: { type: Object, default: () => ({}) },
  },
  setup(props, { slots }) {
    const ui = useRegalUi()
    return () => {
      const host = ui.slot(props.name)
      const nodes = (host ? host(props.scope) : slots.default?.()) as VNode[] & { key?: string } | undefined
      // Keyed by whose markup it is (and which of a host's conditional
      // templates, the key Vue puts on its result), like Vue's own slot
      // outlet: compiled markup from two templates must never be patched into
      // each other (their patch flags only cover what each template changes).
      return h(Fragment, { key: host ? `host:${nodes?.key ?? ''}` : 'regal' }, nodes ?? [])
    }
  },
})
