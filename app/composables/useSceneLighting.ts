// The lighting grid under test in the dev server (utils/stage/lighting.ts:
// ?bright=, ?light=, ?gloss=, ?env=, switched in the dev drawer). Production
// builds always use the shipped values: the query is read in dev only, so a
// shared link never changes what a visitor sees.
import { lightingGrid, SHIPPED_GRID } from '#layers/regal/app/utils/stage/lighting'
import type { LightingGrid } from '#layers/regal/app/utils/stage/lighting'

export function useLightingGrid(): ComputedRef<LightingGrid> {
  if (!import.meta.dev) return computed<LightingGrid>(() => SHIPPED_GRID)
  const route = useRoute()
  return computed<LightingGrid>(() => lightingGrid(route.query))
}
