import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_TEXT } from '../../shared/config'
import type { Attachment, AttachmentBrief } from '../../shared/types'
import { makeId } from './store'

/** File types whose *content* a text model can read. Everything else is named only. */
const TEXT_LIKE = /^(text\/|application\/(json|xml|javascript|typescript|sql|x-yaml|yaml)|image\/svg\+xml$)/

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

export function kindOf(file: File): Attachment['kind'] {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'file'
}

const dataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })

/** Reads a picked file into the shape a thread renders and a prompt can use. */
export async function readAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`${file.name} is ${mb(file.size)}. Keep files under ${mb(MAX_ATTACHMENT_BYTES)}.`)
  }
  const kind = kindOf(file)
  const attachment: Attachment = {
    id: makeId('f'),
    name: file.name,
    kind,
    mime: file.type || 'application/octet-stream',
    size: file.size,
  }
  // Text is what a model can actually use. Media is previewed here but only named upstream.
  if (TEXT_LIKE.test(file.type) && kind !== 'image') {
    attachment.text = (await file.text()).slice(0, MAX_ATTACHMENT_TEXT)
    return attachment
  }
  if (kind !== 'file') attachment.src = await dataUrl(file)
  return attachment
}

/** The part of an attachment that is allowed to travel to the Worker. */
export const briefOf = (attachment: Attachment): AttachmentBrief => ({
  name: attachment.name,
  kind: attachment.kind,
  mime: attachment.mime,
  size: attachment.size,
  text: attachment.text,
})

export const sizeLabel = (bytes: number) => (bytes >= 1024 * 1024 ? mb(bytes) : `${Math.max(1, Math.round(bytes / 1024))} KB`)
