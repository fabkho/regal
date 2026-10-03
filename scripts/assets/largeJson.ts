// JSON too large for one JavaScript string: a Gemini batch with 30 2K images
// answers with 500+ MB of inline base64, past V8's string limit
// (ERR_STRING_TOO_LONG). The bytes fit in a Buffer, so long string values are
// cut out before parsing and stand in as small placeholders; each one is read
// back on its own (a single image is a few MB).

const QUOTE = 0x22
const BACKSLASH = 0x5C
const PLACEHOLDER = '\u0000blob:'

export interface LargeJson {
  value: unknown
  /** The string a value from `value` stands for (placeholders resolved, others as is). */
  text: (value: string) => string
  /** Raw bytes of a cut-out string (base64 stays undecoded), or null for an ordinary string. */
  bytes: (value: string) => Buffer | null
}

/** Parses JSON bytes, moving string values longer than `cutAt` bytes out of the parsed text. */
export function parseLargeJson(buffer: Buffer, cutAt = 64 * 1024): LargeJson {
  const blobs: Buffer[] = []
  const pieces: Buffer[] = []
  let copied = 0
  let at = 0
  while (true) {
    const open = buffer.indexOf(QUOTE, at)
    if (open < 0) break
    let close = buffer.indexOf(QUOTE, open + 1)
    // A quote after an odd number of backslashes is part of the string.
    while (close > 0) {
      let slashes = 0
      while (buffer[close - 1 - slashes] === BACKSLASH) slashes++
      if (slashes % 2 === 0) break
      close = buffer.indexOf(QUOTE, close + 1)
    }
    if (close < 0) throw new Error('parseLargeJson: unterminated string')
    // Only plain strings (base64 has no escapes) are cut; others stay in the text.
    const raw = buffer.subarray(open + 1, close)
    if (raw.length > cutAt && !raw.includes(BACKSLASH)) {
      pieces.push(buffer.subarray(copied, open + 1), Buffer.from(`\\u0000blob:${blobs.length}`))
      blobs.push(raw)
      copied = close
    }
    at = close + 1
  }
  pieces.push(buffer.subarray(copied))
  const value = JSON.parse(Buffer.concat(pieces).toString('utf8')) as unknown
  const blobOf = (text: string) => (text.startsWith(PLACEHOLDER) ? blobs[Number(text.slice(PLACEHOLDER.length))] ?? null : null)
  return {
    value,
    text: text => blobOf(text)?.toString('utf8') ?? text,
    bytes: text => blobOf(text),
  }
}
