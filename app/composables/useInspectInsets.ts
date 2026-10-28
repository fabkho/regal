import type { InspectInsets } from '#layers/regal/app/utils/books/pickContext'

export type { InspectInsets }

/**
 * How much of the stage is covered over the 3D, so the picked Book floats in
 * the band between (utils/books/inspect.ts). Zero where nothing covers it
 * (the card on wide stages keeps its own aside move). Of the view's Pick
 * (composables/useBookPick.ts): a view with its own Pick has its own insets.
 */
export function useInspectInsets() {
  return usePickContext().insets
}
