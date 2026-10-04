import { renderQuality } from '#layers/regal/app/utils/stage/quality'
import type { RenderQuality } from '#layers/regal/app/utils/stage/quality'

/**
 * How hard the 3D works on this device (utils/stage/quality.ts): phones and
 * tablets (a coarse primary pointer) get the mobile tier; `?quality=mobile`
 * or `?quality=desktop` tries either anywhere. The canvas only exists in the
 * browser, so this is read there; the server answers desktop.
 */
export function useRenderQuality(): ComputedRef<Readonly<RenderQuality>> {
  const route = useRoute()
  const coarse = import.meta.client && window.matchMedia('(pointer: coarse)').matches
  return computed(() => renderQuality({ coarsePointer: coarse, override: route.query.quality as string | undefined }))
}

/**
 * The canvas pixel ratio in use, shared between the stage (which hands it to
 * the canvas) and components/stage/Frames.vue (which lowers it on a device
 * that can't keep up). 0 until the stage sets it.
 */
export function useStageDpr() {
  return useState<number>('regal:stage-dpr', () => 0)
}
