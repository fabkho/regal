// Date separators in the Stack: how much room each look takes in the pile and
// how big its date can be. Pure; the 3D lives in components/stack/Separators.vue.
import type { StackSeparator } from './layout'

export type SeparatorStyle = 'slab' | 'numerals' | 'label' | 'tab' | 'volume'

export const SEPARATOR_STYLES: { value: SeparatorStyle, title: string, text: string }[] = [
  { value: 'numerals', title: 'Numerals', text: 'Extruded ink numerals stand beside the pile on a thin paper card (brick-red front edge) that runs under each group.' },
  { value: 'slab', title: 'Paper slab', text: 'A paper board lies between the Books with the date and count printed into its front edge.' },
  { value: 'label', title: 'Flat label', text: 'A hairline ink sheet in the pile and a flat printed label with a leader line beside it.' },
  { value: 'tab', title: 'Index tab', text: 'A paper divider card like in a card index: its tab stands up beside the pile with the date printed on it.' },
  { value: 'volume', title: 'Volume', text: 'An ink-black volume lies in the pile like a Book, the date in paper white and the count in red on its Spine.' },
]

/** Height a separator takes in the pile, metres. */
export const SEPARATOR_THICKNESS: Record<SeparatorStyle, number> = {
  slab: 0.014,
  numerals: 0.004,
  label: 0.003,
  tab: 0.003,
  volume: 0.02,
}

/** Looks whose date stands beside the pile (the others carry it on their front edge). */
export const SIDE_STYLES: ReadonlySet<SeparatorStyle> = new Set(['numerals', 'label', 'tab'])

/** Looks whose date stands beside the pile: the camera needs this much width (metres) instead of the pile's own. */
export const SIDE_LABEL_FIT_WIDTH = 0.68

/**
 * Free height above each separator for a date standing beside the pile: up to
 * the next separator, or the top of the pile (plus a little headroom).
 */
export function separatorRoom(separators: Pick<StackSeparator, 'key' | 'y' | 'thickness'>[], pileHeight: number): Map<string, number> {
  const sorted = [...separators].sort((a, b) => a.y - b.y)
  return new Map(sorted.map((separator, index) => {
    const top = separator.y + separator.thickness / 2
    const next = sorted[index + 1]
    const ceiling = next ? next.y - next.thickness / 2 : pileHeight + 0.02
    return [separator.key, Math.max(0, ceiling - top)]
  }))
}

/** Monospace advance and cap height, per em (IBM Plex Mono). */
export const MONO_ADVANCE = 0.6
export const MONO_CAP = 0.698

/**
 * Em size for a date in a monospace font: as big as `maxCap` allows, but no
 * wider than `maxWidth` and no taller than the room above its separator.
 * `chars` overrides the width in characters (a label set in two sizes).
 */
export function labelEm(label: string, options: { maxCap: number, maxWidth: number, room: number, minCap?: number, chars?: number }): number {
  const byWidth = options.maxWidth / (Math.max(1, options.chars ?? label.length) * MONO_ADVANCE)
  const byRoom = (options.room * 0.85) / MONO_CAP
  const em = Math.min(options.maxCap / MONO_CAP, byWidth, byRoom)
  return Math.max(em, (options.minCap ?? 0) / MONO_CAP)
}
