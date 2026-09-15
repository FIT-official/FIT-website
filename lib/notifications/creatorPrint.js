/**
 * Best-effort notifications for creator-handled print jobs. Every leg is
 * isolated in try/catch and never throws: a mail or chat failure must never
 * fail the request that triggered it. Mirrors lib/notifications/customPrint.js
 * but the counterparty is the creator, not Fix It Today.
 */
import { clerkClient } from '@clerk/nextjs/server'
import { sendEmail } from '@/lib/email'
import { postCustomPrintChatUpdate } from '@/lib/chatNotify'
import { buildCreatorNewRequestEmail, buildCreatorQuoteEmail } from '@/lib/email/templates/creatorPrint'
import { connectToDatabase } from '@/lib/db'
import User from '@/models/User'

async function safeSend(to, built) {
  if (!to || !built) return
  try {
    await sendEmail({ to, subject: built.subject, html: built.html })
  } catch (err) {
    console.error('[notify:creatorPrint] email send failed:', err)
  }
}

/** Creator's primary email + display name; null fields when unavailable. */
export async function lookupCreatorContact(creatorUserId) {
  const out = { email: null, name: null }
  if (!creatorUserId) return out
  try {
    const client = await clerkClient()
    const u = await client.users.getUser(creatorUserId)
    out.email = u?.emailAddresses?.[0]?.emailAddress || null
    out.name = [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.username || null
  } catch (err) {
    console.error('[notify:creatorPrint] clerk lookup failed:', err)
  }
  try {
    await connectToDatabase()
    const doc = await User.findOne({ userId: creatorUserId }, { 'metadata.displayName': 1, _id: 0 }).lean()
    if (doc?.metadata?.displayName) out.name = doc.metadata.displayName
  } catch (err) {
    console.error('[notify:creatorPrint] display name lookup failed:', err)
  }
  return out
}

/** A customer submitted a configured request to the creator's service. */
export async function notifyCreatorNewRequest({ request } = {}) {
  if (!request?.creatorUserId) return
  try {
    const creator = await lookupCreatorContact(request.creatorUserId)
    await safeSend(creator.email, buildCreatorNewRequestEmail({ request, creatorName: creator.name }))
  } catch (err) {
    console.error('[notify:creatorPrint] new-request leg failed:', err)
  }
}

/** The creator quoted the job: email the customer + open the chat thread. */
export async function notifyCustomerCreatorQuote({ request, amount, note } = {}) {
  if (!request?.creatorUserId) return
  let creatorName = null
  try {
    creatorName = (await lookupCreatorContact(request.creatorUserId)).name
    await safeSend(request.userEmail, buildCreatorQuoteEmail({ request, creatorName, amount, note }))
  } catch (err) {
    console.error('[notify:creatorPrint] quote email leg failed:', err)
  }
  try {
    const currency = String(request.currency || 'sgd').toUpperCase()
    const text = `Your quote for "${request.modelFile?.originalName || 'your model'}" is ${currency} ${Number(amount).toFixed(2)}.${note ? ` ${note}` : ''} Payment is arranged directly here with me.`
    await postCustomPrintChatUpdate({
      buyerUserId: request.userId,
      creatorUserId: request.creatorUserId,
      text,
    })
  } catch (err) {
    console.error('[notify:creatorPrint] quote chat leg failed:', err)
  }
}
