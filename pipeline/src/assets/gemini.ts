// Minimal Gemini REST client for the asset pipeline (image + text).
// Needs GEMINI_API_KEY; image models have no free tier (billing required).

import type { LargeJson } from './largeJson'
import { parseLargeJson } from './largeJson'

export const IMAGE_MODEL = 'gemini-3-pro-image'
export const TEXT_MODEL = 'gemini-flash-lite-latest'
/** Standard price per 2K image for IMAGE_MODEL. */
export const IMAGE_COST_USD = 0.134
/** Batch API price: the same images, half the price, results within minutes to 24 h. */
export const BATCH_COST_USD = IMAGE_COST_USD / 2

interface Part { text?: string, inline_data?: { mime_type: string, data: string }, inlineData?: { mimeType: string, data: string } }

async function generate(model: string, parts: Part[], generationConfig: Record<string, unknown>) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set')
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig }),
    signal: AbortSignal.timeout(300_000),
  })
  if (!response.ok) throw new Error(`Gemini ${model}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`)
  const data = await response.json() as { candidates?: { content?: { parts?: Part[] } }[] }
  return data.candidates?.[0]?.content?.parts ?? []
}

export interface ImageRequest {
  /** Identifies the result in a batch. */
  key: string
  prompt: string
  images: { mime: string, data: Buffer }[]
  aspectRatio: string
  imageSize?: string
}

function imageParts(request: ImageRequest): Part[] {
  return [{ text: request.prompt }, ...request.images.map(image => ({ inline_data: { mime_type: image.mime, data: image.data.toString('base64') } }))]
}

const imageConfig = (request: ImageRequest) => ({ responseModalities: ['IMAGE'], imageConfig: { aspectRatio: request.aspectRatio, imageSize: request.imageSize ?? '2K' } })

function imageOf(parts: Part[], large?: LargeJson): Buffer | null {
  const inline = parts.find(part => part.inlineData || part.inline_data)
  const data = inline?.inlineData?.data ?? inline?.inline_data?.data
  if (!data) return null
  const bytes = large?.bytes(data)
  return Buffer.from(bytes ? bytes.toString('latin1') : data, 'base64')
}

/** One image from a prompt and input images; returns PNG/JPEG bytes. */
export async function generateImage(prompt: string, images: { mime: string, data: Buffer }[], aspectRatio: string, imageSize = '2K'): Promise<Buffer> {
  const request: ImageRequest = { key: 'single', prompt, images, aspectRatio, imageSize }
  const image = imageOf(await generate(IMAGE_MODEL, imageParts(request), imageConfig(request)))
  if (!image) throw new Error('Gemini returned no image')
  return image
}

// --- Batch API (half price, asynchronous) ------------------------------------------

/** Inline batch requests must stay under 20 MB in total. */
export const BATCH_INLINE_LIMIT = 18 * 1024 * 1024

function apiKey() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set')
  return key
}

/** Submits image requests as one batch job; returns its name (batches/…). */
export async function submitImageBatch(requests: ImageRequest[], displayName: string): Promise<string> {
  const body = {
    batch: {
      display_name: displayName,
      input_config: {
        requests: {
          requests: requests.map(request => ({
            request: { contents: [{ role: 'user', parts: imageParts(request) }], generationConfig: imageConfig(request) },
            metadata: { key: request.key },
          })),
        },
      },
    },
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:batchGenerateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  })
  if (!response.ok) throw new Error(`Gemini batch: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`)
  const data = await response.json() as { name?: string }
  if (!data.name) throw new Error('Gemini batch: no job name returned')
  return data.name
}

export type BatchState = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired' | 'unknown'

export interface BatchStatus {
  state: BatchState
  /** Per request key: the image, or an error message. Only when succeeded. */
  results: Map<string, Buffer | string>
}

interface BatchResponse {
  done?: boolean
  metadata?: { state?: string }
  response?: { inlinedResponses?: { inlinedResponses?: { response?: { candidates?: { content?: { parts?: Part[] } }[] }, error?: { message?: string }, metadata?: { key?: string } }[] } }
  error?: { message?: string }
}

export async function getImageBatch(name: string): Promise<BatchStatus> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
    headers: { 'x-goog-api-key': apiKey() },
    signal: AbortSignal.timeout(300_000),
  })
  if (!response.ok) throw new Error(`Gemini batch ${name}: HTTP ${response.status}`)
  // Too big for response.json() once done (see largeJson.ts).
  const large = parseLargeJson(Buffer.from(await response.arrayBuffer()))
  const data = large.value as BatchResponse
  const raw = (data.metadata?.state ?? '').replace(/^(BATCH|JOB)_STATE_/, '').toLowerCase()
  const state = (['pending', 'running', 'succeeded', 'failed', 'cancelled', 'expired'].includes(raw) ? raw : 'unknown') as BatchState
  const results = new Map<string, Buffer | string>()
  for (const item of data.response?.inlinedResponses?.inlinedResponses ?? []) {
    const key = item.metadata?.key
    if (!key) continue
    const image = imageOf(item.response?.candidates?.[0]?.content?.parts ?? [], large)
    results.set(key, image ?? item.error?.message ?? 'no image in response')
  }
  return { state, results }
}

export async function generateText(prompt: string): Promise<string> {
  const out = await generate(TEXT_MODEL, [{ text: prompt }], { temperature: 0 })
  return out.map(part => part.text ?? '').join('').trim()
}
