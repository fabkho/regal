# Bookcase model

**Source:** [Antique wooden bookcase - Game model](https://sketchfab.com/3d-models/antique-wooden-bookcase-game-model-75aa9519195647d99cf1e2d4863dbe87) by [Lorenzo Drago](https://sketchfab.com/LorenzoDrago), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit must stay visible in the app.

**Obtained without a Sketchfab account** via the Objaverse mirror (Allen AI, Hugging Face):
`https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-009/75aa9519195647d99cf1e2d4863dbe87.glb` (5.6 MB)

**Processing** (`strip.mjs`, gltf-transform 4.5.1 + sharp 0.35.5):
1. Removed the 24 bundled `book-stacks` meshes and their material/textures.
2. prune + dedup.
3. Textures → WebP (`EXT_texture_webp`), max 2048², quality 85.

Result: `public/models/bookcase.glb`, 295 KB. One mesh (`bottom_lp.001_bookcase_0`), one PBR material (`bookcase`: baseColor, ORM, normal).

**Model units:** bounds x ±1.918, y 0→4.511, z 0→0.679. Scale in-app to real-world metres. 4 bays × 6 shelves above a cabinet base; open back.

**Measuring the Shelves** (`measure-shelves.mjs`, no dependencies):

```sh
node assets-src/bookcase/measure-shelves.mjs          # rewrites app/utils/bookcase/shelves.ts
node assets-src/bookcase/measure-shelves.mjs --check   # fails if that file is stale
```

It parses the GLB by hand, collects world-space triangles and reads the furniture off them: up-facing boards deep and wide enough to hold a Book are Shelf surfaces, inward-facing vertical planes are the bay dividers, the tall front-facing plane at the back is the back panel, and the nearest down-facing face above a Shelf gives its clearance. Output is `SHELF_SLOTS` in world metres, scaled so the Bookcase is 2.4 m tall (`BOOKCASE_SCALE` = 0.532035).

Measured: 4 bays × 6 Shelves = 24 slots. Bay width 0.4256 m, usable depth 0.1443 m (0.1578 m on the bottom Shelf, which sits on the cabinet top). Shelf surfaces at y = 1.9659, 1.6765, 1.3863, 1.0969, 0.8075, 0.5217 m with clearances 0.2464, 0.2743, 0.2750, 0.2743, 0.2743, 0.2706 m. The top Shelf is the tight one — a cornice ledge hangs into the bay opening — so `MAX_BOOK_HEIGHT` is 0.2464 m.

**Frieze / back-panel ghosting.** The faint pattern on the crown frieze and the bay backs is baked into the *textures*, not a UV or material bug: the original model was baked with its book stacks in place, so their contact shadows survive in the base colour and, more strongly, in the occlusion channel of the ORM map (the back-panel island shows a row of soft book-shaped blobs). Removing it properly means repainting or re-baking the atlas, so the scene just avoids showing it off: `ENVIRONMENT_INTENSITY` and `WOOD_MATERIAL.envMapIntensity` stay low, which keeps the ghosts at the edge of visibility — and Books will cover those panels anyway. Related trap: the ORM's roughness is only ≈0.45 and its metallic channel is 1.0 everywhere (the glTF zeroes it with `metallicFactor: 0`), so lowering `roughness` below 1 or raising `envMapIntensity` makes the case mirror the environment and turn milky grey.

![before/after](../../docs/assets/bookcase-before-after.png)
