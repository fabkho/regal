// Minimal Gemini REST client for the asset pipeline (image + text).
// Needs GEMINI_API_KEY; image models have no free tier (billing required).

export const IMAGE_MODEL = 'gemini-3-pro-image'
export const TEXT_MODEL = 'gemini-flash-lite-latest'
/** Standard price per 2K image for IMAGE_MODEL (Batch API: half). */
export const IMAGE_COST_USD = 0.134

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

/** One image from a prompt and input images; returns PNG/JPEG bytes. */
export async function generateImage(prompt: string, images: { mime: string, data: Buffer }[], aspectRatio: string, imageSize = '2K'): Promise<Buffer> {
  const parts: Part[] = [{ text: prompt }, ...images.map(image => ({ inline_data: { mime_type: image.mime, data: image.data.toString('base64') } }))]
  const out = await generate(IMAGE_MODEL, parts, { responseModalities: ['IMAGE'], imageConfig: { aspectRatio, imageSize } })
  const inline = out.find(part => part.inlineData || part.inline_data)
  const data = inline?.inlineData?.data ?? inline?.inline_data?.data
  if (!data) throw new Error('Gemini returned no image')
  return Buffer.from(data, 'base64')
}

export async function generateText(prompt: string): Promise<string> {
  const out = await generate(TEXT_MODEL, [{ text: prompt }], { temperature: 0 })
  return out.map(part => part.text ?? '').join('').trim()
}
