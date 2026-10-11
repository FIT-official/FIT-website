import { emailLayout, emailResult, bodyBlock, infoTable, ctaButton, esc, money, SITE_URL } from '@/lib/email/template'
import { customerName, modelName, printSummary, requestDetailsUrl } from '@/lib/email/printDetails'
export function buildCreatorNewRequestEmail({ request, creatorName, preview } = {}) {
  const detailsUrl = `${SITE_URL}/dashboard/print-jobs`
  return emailResult(`New print request - ${modelName(request)}`, emailLayout({
    title: 'New print request', preheader: `${customerName(request)} sent you a print request.`, reference: request?.requestId, detailsUrl,
    bodyHtml: bodyBlock({ heading: 'New print request', paragraphs: [
      `Hi ${esc(creatorName || 'there')},`, `${esc(customerName(request))} sent a model to your print service. Review the saved details before preparing a quote.`,
    ] }) + printSummary(request, { preview }) + infoTable([['Customer note', request?.customerNote]]) + ctaButton({ href: detailsUrl, label: 'Open print jobs' }),
  }))
}
export function buildCreatorQuoteEmail({ request, creatorName, amount, note, preview } = {}) {
  const detailsUrl = requestDetailsUrl(request)
  return emailResult(`Quote ready - ${modelName(request)}`, emailLayout({
    title: 'Your creator quote is ready', reference: request?.requestId, detailsUrl, preheader: `${creatorName || 'The creator'} has prepared your quote.`,
    bodyHtml: bodyBlock({ heading: 'Your quote is ready', paragraphs: [
      `Hi ${esc(customerName(request))},`, `${esc(creatorName || 'The creator')} has quoted your print.`,
      ...(note ? [`Note from the creator: ${esc(note)}`] : []),
      'Payment is arranged directly with the creator. Reply in your messages to confirm the scope and next steps.',
    ] }) + printSummary(request, { preview }) + infoTable([['Quote', amount != null ? money(amount, request?.currency) : null], ['Handled by', creatorName]]) + ctaButton({ href: detailsUrl, label: 'View my print request' }),
  }))
}
