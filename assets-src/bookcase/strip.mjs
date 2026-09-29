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
  if (mesh && mesh.getName().includes('book-stacks')) { node.dispose(); removed++ }
}
await doc.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 85 }))
const b = getBounds(root.listScenes()[0])
console.log('removed', removed, 'bounds', b.min.map(v=>v.toFixed(3)), b.max.map(v=>v.toFixed(3)))
await io.write('bookcase.glb', doc)
