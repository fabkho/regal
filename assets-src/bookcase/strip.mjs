// Strips the bundled books from the Objaverse copy of the bookcase and
// compresses textures. Run from a scratch dir with the source file:
//   curl -L -o antique.glb https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-009/75aa9519195647d99cf1e2d4863dbe87.glb
//   pnpm add @gltf-transform/core@latest @gltf-transform/extensions@latest @gltf-transform/functions@latest sharp@latest   (built with 4.5.1 / sharp 0.35.5)
//   node strip.mjs   # → bookcase.glb
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prune, dedup, textureCompress, getBounds } from '@gltf-transform/functions'
import sharp from 'sharp'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read('antique.glb')
const root = doc.getRoot()
let removed = 0
for (const node of root.listNodes()) {
  const mesh = node.getMesh()
  if (mesh && mesh.getName().includes('book-stacks')) {
    node.dispose()
    removed++
  }
}
await doc.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 85 }))
const b = getBounds(root.listScenes()[0])
console.log('removed', removed, 'bounds', b.min.map(v => v.toFixed(3)), b.max.map(v => v.toFixed(3)))
await io.write('bookcase.glb', doc)
