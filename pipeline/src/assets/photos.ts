// Photo drop-ins (#27): faces the owner photographed for a special edition.
// Put them in <photos>/<key>/ as front/spine/back.(jpg|jpeg|png|webp) (key:
// the ISBN-13, else the Book id); Regal assets converts them to
// <key>/<face>.webp and lists them in the Book's `assets.photoFaces`. A
// photographed face is never replaced, by AI or anything else.
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

/** The drop-in files in a Book's photo folder, or an empty list when there is none. */
export function photoFiles(folder: string): string[] {
  if (!existsSync(folder)) return []
  try {
    return readdirSync(folder, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name)
  }
  catch {
    return []
  }
}

/** One drop-in face as the WebP the Book gets (camera orientation honoured, ≤ PHOTO_MAX_HEIGHT tall). */
export async function convertPhoto(folder: string, file: string): Promise<Buffer> {
  return sharp(join(folder, file))
    .rotate() // honour the camera's EXIF orientation
    .resize({ height: PHOTO_MAX_HEIGHT, withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer()
}
