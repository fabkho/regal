// Back-cover blurb: the story part of the publisher description, without
// marketing (bestseller/award lines, review quotes, film tie-ins, edition
// notes). A small text model does the cutting; a check makes sure it only
// deleted: every sentence it returns must appear verbatim in the source.
import { cleanDescription } from '../resolvers/descriptions'
import { generateText } from './gemini'

export interface BlurbResult {
  text: string
  source: 'apple' | 'library' | 'none'
  method: 'model' | 'rules'
}

const PROMPT = `Below is a book's publisher description. Return only the text that describes the book itself (its story or subject), as it would be printed on the back cover.

Delete: bestseller, award, prize and "finalist" lines; review quotes and their attributions; film or TV adaptation notes and cast lists; "from the author of" credentials; edition notes ("Alternate cover edition…", "Now in paperback", "25th anniversary edition"); series marketing; lists of praise.

Do NOT rewrite, paraphrase, reorder, shorten or add words: copy the kept sentences exactly as they are. Separate paragraphs with one blank line; if the source has no paragraphs, start a new paragraph only where a new thought begins. Output plain text only, nothing else.

Description:
"""
{TEXT}
"""`

const normalize = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()

/** True when every sentence of `extract` appears verbatim (ignoring punctuation and case) in `source`. */
export function onlyDeleted(extract: string, source: string): boolean {
  const haystack = normalize(source)
  const sentences = extract.split(/(?<=[.!?…"”])\s+|\n+/).map(normalize).filter(sentence => sentence.length > 0)
  return sentences.length > 0 && sentences.every(sentence => haystack.includes(sentence))
}

/** Picks the best source text: Apple's (structured HTML, the edition's publisher copy), else the Library's own. */
export async function resolveBlurb(appleDescription: string | null, libraryDescription: string | null | undefined, useModel = true): Promise<BlurbResult> {
  const apple = cleanDescription(appleDescription ?? '')
  const library = cleanDescription(libraryDescription ?? '')
  const [source, text] = apple.length >= 200 || !library ? ['apple', apple] as const : ['library', library] as const
  if (!text) return { text: '', source: 'none', method: 'rules' }
  if (!useModel) return { text, source, method: 'rules' }
  try {
    const extract = cleanDescription(await generateText(PROMPT.replace('{TEXT}', text)))
    if (extract.length >= 80 && onlyDeleted(extract, text)) return { text: extract, source, method: 'model' }
  }
  catch (error) {
    console.warn(`  blurb model failed: ${(error as Error).message}`)
  }
  return { text, source, method: 'rules' }
}
