import { loadAssetManifest, setAssetsBase } from '#layers/regal/app/utils/covers/bookAssets'

/**
 * Points the Book asset set at `runtimeConfig.public.regal.assetsBase` (a host
 * app's own folder in 'embed' mode). A host page always shows the Stack, so
 * its manifest is fetched right away (it was preloaded, see LibraryStage),
 * not once the 3D is up: no image can be asked for before it is in.
 */
export default defineNuxtPlugin(() => {
  const { assetsBase, mode } = useRegalConfig()
  setAssetsBase(assetsBase)
  if (mode === 'embed') void loadAssetManifest()
})
