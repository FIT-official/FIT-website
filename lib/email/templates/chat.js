/**
 * Pure builder for the "you have a new chat message" email. No I/O.
 * The message preview is escaped and truncated so the email never leaks markup
 * or an unbounded body.
 */
import { emailLayout, emailResult, bodyBlock, infoTable, ctaButton, esc, SITE_URL } from '@/lib/email/template'

const MESSAGES_URL = `${SITE_URL}/account?tab=messages`

function preview(text, max = 140) {
  const s = String(text ?? '').trim()
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/**
 * @param {{ senderName?: string, messageText?: string }} args
 * @returns {{ subject: string, html: string }}
 */
export function buildNewChatMessageEmail({ senderName, messageText } = {}) {
  const from = senderName || 'someone'
  const snippet = preview(messageText)
  const html = emailLayout({
    title: `New message from ${from}`,
    preheader: snippet || `You have a new message from ${from}.`,
    bodyHtml:
      bodyBlock({
        heading: `New message from ${from}`,
        paragraphs: [
          `You've received a new chat message on Fix It Today.`,
          snippet ? `<i>“${esc(snippet)}”</i>` : '',
        ],
      }) +
      infoTable([['From', from]]) +
      ctaButton({ href: MESSAGES_URL, label: 'Open conversation' }),
  })
  return emailResult(`New message from ${from}`, html)
}
