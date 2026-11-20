/**
 * Does this reply contain work product, or is it just an answer?
 *
 * Desks are supposed to tag their finished work for Grant, but a model does not always
 * remember. This is the floor's backstop: something structured — a list, a plan with
 * headings, a code block — gets signed off, while a short factual answer stays a chat
 * message and never lands on anyone's desk.
 */

/** Markdown stripped down to something speakable and countable. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/<decision[\s\S]*?<\/decision>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[#>*+-]+\s*/gm, '')
    .replace(/^\d+[.)]\s+/gm, '')
    .replace(/[*_]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function looksLikeWork(reply: string): boolean {
  const body = reply.replace(/<decision[\s\S]*?<\/decision>/gi, '').trim()
  // A code block is a deliverable however short it is.
  if (/```/.test(body)) return true
  // Below this, even a list is a remark rather than a piece of work.
  if (body.length < 120) return false

  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean)
  const bullets = lines.filter((line) => /^([-*+]|\d+[.)])\s+\S/.test(line)).length
  const headings = lines.filter((line) => /^#{1,6}\s+\S/.test(line) || /^\*\*[^*]{2,60}\*\*$/.test(line)).length

  return bullets >= 3 || headings >= 1
}

/** A title for the sign-off card, taken from the work itself. */
export function workTitle(reply: string): string {
  const body = reply.replace(/<decision[\s\S]*?<\/decision>/gi, '')
  const lead = body.split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? body
  const opening = plainText(lead)
  // A reply usually opens with its own title line; otherwise fall back to its first sentence.
  const sentence = plainText(body).match(/^.{0,64}?(?:[.!?](?=\s|$)|$)/)?.[0]?.trim() ?? ''
  const title = opening.length >= 8 ? opening : sentence
  if (!title) return 'A draft is ready for sign-off'
  return title.length > 68 ? `${title.slice(0, 65).trimEnd()}…` : title
}
