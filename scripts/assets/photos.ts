// Photo drop-ins (#27): faces the owner photographed for a special edition.
// Put them in public/book-assets/<key>/photo/ as front/spine/back.(jpg|jpeg|
// png|webp); the build converts them to <key>/<face>.webp and records them in
// the manifest's `photoFaces`. A photographed face is never overwritten by AI.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

export const PHOTO_FACES = ['front', 'spine', 'back'] as const
export type PhotoFace = typeof PHOTO_FACES[number]

/** Extensions a drop-in may use, in the order we prefer them. */
export const PHOTO_EXTENSIONS = ['webp', 'jpg', 'jpeg', 'png'] as const

/** Longest side of a converted photo face, matching the AI faces. */
export const PHOTO_MAX_HEIGHT = 1600

/** The drop-in file for one face, out of a folder listing. Pure. */
export function photoFileFor(files: string[], face: PhotoFace): string | null {
  for (const extension of PHOTO_EXTENSIONS) {
    const hit = files.find(file => file.toLowerCase() === `${face}.${extension}`)
    if (hit) return hit
  }
  return null
}

/** Which faces a drop-in folder holds, in face order. Pure. */
export function photoFacesIn(files: string[]): PhotoFace[] {
  return PHOTO_FACES.filter(face => photoFileFor(files, face) !== null)
}

/** The drop-in folder of a Book's asset set. */
export const photoDir = (dir: string) => join(dir, 'photo')

/** The drop-in files in `<dir>/photo`, or an empty list when there are none. */
export function photoFiles(dir: string): string[] {
  const folder = photoDir(dir)
  if (!existsSync(folder)) return []
  try {
    return readdirSync(folder, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name)
  }
  catch {
    return []
  }
}

/**
 * Converts the drop-in faces of one Book to `<face>.webp` beside them and
 * returns the faces it wrote, in face order.
 */
export async function convertPhotos(dir: string, faces: PhotoFace[] = photoFacesIn(photoFiles(dir))): Promise<PhotoFace[]> {
  const files = photoFiles(dir)
  const written: PhotoFace[] = []
  for (const face of faces) {
    const file = photoFileFor(files, face)
    if (!file) continue
    const image = sharp(join(photoDir(dir), file))
      .rotate() // honour the camera's EXIF orientation
      .resize({ height: PHOTO_MAX_HEIGHT, withoutEnlargement: true })
      .webp({ quality: 90 })
    await image.toFile(join(dir, `${face}.webp`))
    written.push(face)
  }
  return written
}
