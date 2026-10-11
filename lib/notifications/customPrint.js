/**
 * Orchestrates customer/admin email + buyer↔vendor chat for each custom-print
 * lifecycle event. Every leg is best-effort and isolated: one channel failing
 * (or being unconfigured) never throws and never blocks the triggering request.
 *
 * Callers pass the `request` (CustomPrintRequest-like, plain object) and the
 * custom-print `product` (for `creatorUserId`). `breakdown` is optional — when
 * omitted it's derived from the request via `customPrintChargeBreakdown` so the
 * email/chat amounts match exactly what checkout charges.
 */
import { sendEmail } from '@/lib/email'
import { preparePrintEmail } from '@/lib/email/printMessage'
import { customPrintChargeBreakdown } from '@/lib/customPrintDisplayPrice'
import { postCustomPrintChatUpdate } from '@/lib/chatNotify'
import { customPrintChatMessage } from '@/lib/chat/customPrintMessages'
import {
  buildAwaitingQuoteEmail,
  buildQuoteReadyEmail,
  buildPaymentReceivedEmail,
  buildPaymentReceivedAdminEmail,
  buildStatusUpdateEmail,
  buildCancelledEmail,
  buildNewRequestAdminEmail,
} from '@/lib/email/templates/customPrint'

const STATUS_EVENTS = new Set(['printing', 'printed', 'shipped', 'delivered'])

function adminEmail() {
  return process.env.ADMIN_EMAIL || process.env.GMAIL_USER || null
}

async function safeSend(to, builder, args) {
  if (!to) return
  try {
    const built = await preparePrintEmail(builder, args)
    if (built) await sendEmail({ to, ...built })
  } catch (err) {
    console.error('[notify:customPrint] email send failed:', err)
  }
}

/**
 * @param {object} args
 * @param {string} args.event - awaiting-quote | quote-ready | paid |
 *   printing | printed | shipped | delivered | cancelled | new-request
 * @param {object} args.request - plain CustomPrintRequest object
 * @param {object} [args.product] - custom-print product (for creatorUserId)
 * @param {object} [args.breakdown] - { lines, total, amount, deliveryFee, currency }
 * @param {string} [args.note] - cancellation reason
 */
export async function notifyCustomPrintEvent({ event, request, product, breakdown, note } = {}) {
  if (!event || !request) return

  const to = request.userEmail || null
  const charge = breakdown || customPrintChargeBreakdown(request, '')
  const modelName = request.modelFile?.originalName || ''
  const status = STATUS_EVENTS.has(event) ? event : request.status

  // ---- Email leg (best-effort) ----
  try {
    if (event === 'awaiting-quote') {
      await safeSend(to, buildAwaitingQuoteEmail, { request })
    } else if (event === 'quote-ready') {
      await safeSend(to, buildQuoteReadyEmail, { request, breakdown: charge })
    } else if (event === 'paid') {
      await safeSend(to, buildPaymentReceivedEmail, { request, breakdown: charge })
      await safeSend(adminEmail(), buildPaymentReceivedAdminEmail, { request, breakdown: charge })
    } else if (STATUS_EVENTS.has(event)) {
      await safeSend(to, buildStatusUpdateEmail, { request, status: event })
    } else if (event === 'cancelled') {
      await safeSend(to, buildCancelledEmail, { request, note })
    } else if (event === 'new-request') {
      await safeSend(adminEmail(), buildNewRequestAdminEmail, { request })
    }
  } catch (err) {
    console.error('[notify:customPrint] email leg failed:', err)
  }

  // ---- Chat leg (best-effort) — new-request has no buyer-facing chat ----
  if (event === 'new-request') return
  try {
    const text = customPrintChatMessage(event, {
      modelName,
      total: charge?.total ?? charge?.amount,
      currency: charge?.currency,
      trackingNumber: request.trackingNumber,
      note,
      status,
    })
    const creatorUserId = product?.creatorUserId
    if (text && creatorUserId) {
      await postCustomPrintChatUpdate({
        buyerUserId: request.userId,
        creatorUserId,
        text,
      })
    }
  } catch (err) {
    console.error('[notify:customPrint] chat leg failed:', err)
  }
}
