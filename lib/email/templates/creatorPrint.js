/**
 * Pure `(data) => { subject, html }` builders for creator-handled print jobs
 * (CustomPrintRequest.creatorUserId set). No I/O; user text is escaped via
 * the base-layout `esc`. Payment for these jobs is arranged directly with the
 * creator, so the customer email never links to the cart.
 */
import { emailLayout, bodyBlock, infoTable, ctaButton, esc, money, SITE_URL } from '@/lib/email/template'

const JOBS_URL = `${SITE_URL}/dashboard/print-jobs`
const PRINTS_URL = `${SITE_URL}/account/prints`

function customerName(request) {
  return request?.userName || request?.userEmail || 'A customer'
}

function modelName(request) {
  return request?.modelFile?.originalName || 'your model'
}

/** Creator: a customer sent a request to your print service. */
export function buildCreatorNewRequestEmail({ request, creatorName } = {}) {
  const reqId = request?.requestId || ''
  const generic = request?.printConfiguration?.generic || {}
  const html = emailLayout({
    title: 'New print request for your service',
    preheader: `${customerName(request)} sent you a print request.`,
    bodyHtml:
      bodyBlock({
        heading: 'New print request',
        paragraphs: [
          `Hi ${esc(creatorName || 'there')}, <b>${esc(customerName(request))}</b> uploaded a model to your print service and is waiting for a quote.`,
        ],
      }) +
      infoTable([
        ['Request ID', reqId],
        ['Model', request?.modelFile?.originalName],
        ['Material', generic.material],
        ['Colour', generic.colour],
        ['Customer note', request?.customerNote],
      ]) +
      ctaButton({ href: JOBS_URL, label: 'Open print jobs' }),
  })
  return { subject: `New print request — ${request?.modelFile?.originalName || reqId}`, html }
}

/** Customer: the creator has quoted your job (pay the creator directly). */
export function buildCreatorQuoteEmail({ request, creatorName, amount, note } = {}) {
  const currency = request?.currency || 'sgd'
  const html = emailLayout({
    title: 'Your print quote is ready',
    preheader: `${creatorName || 'The creator'} quoted ${money(amount, currency)} for ${modelName(request)}.`,
    bodyHtml:
      bodyBlock({
        heading: 'Your quote is ready',
        paragraphs: [
          `<b>${esc(creatorName || 'The creator')}</b> has quoted your print of <b>${esc(modelName(request))}</b>.`,
          ...(note ? [`Note from the creator: ${esc(note)}`] : []),
          'Payment is arranged directly with the creator. Reply in your messages to confirm and settle the quote.',
        ],
      }) +
      infoTable([
        ['Quote', money(amount, currency)],
        ['Handled by', creatorName],
        ['Request ID', request?.requestId],
      ]) +
      ctaButton({ href: PRINTS_URL, label: 'View my print requests' }),
  })
  return { subject: `Quote ready — ${modelName(request)}`, html }
}
