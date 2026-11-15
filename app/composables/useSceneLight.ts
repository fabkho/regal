// The lighting variant under test in the dev server (?light=brighter|
// cleaner|contrast, switched in the dev drawer). Production builds always use
// 'today': the query is read in dev only, so a shared link never changes what
// a visitor sees.
import { DEFAULT_SCENE_LIGHT, sceneLightTuning } from '#layers/regal/app/utils/stage/lighting'
import type { SceneLight } from '#layers/regal/app/utils/stage/lighting'

export function useSceneLight(): ComputedRef<SceneLight> {
  if (!import.meta.dev) return computed<SceneLight>(() => DEFAULT_SCENE_LIGHT)
  const route = useRoute()
  return computed<SceneLight>(() => sceneLightTuning(route.query))
}
