import { createHash } from 'node:crypto'
import ChatAutoReply from '@/models/ChatAutoReply'

export const welcomeId = (channelId, responderId) => createHash('sha256')
  .update(JSON.stringify(['messaging', channelId, responderId])).digest('hex')

// A welcome gets at most one automatic send attempt per channel/responder.
// Unknown provider outcomes retain the durable claim: repeating a POST must
// never turn an acknowledgement failure into another creator-attributed message.
export async function sendWelcomeOnce({ channelId, responderId, send, model = ChatAutoReply }) {
  const _id = welcomeId(channelId, responderId)
  try {
    await model.create({ _id, channelId, responderId, status: 'claimed' })
  } catch (error) {
    if (error?.code === 11000) return { sent: false }
    throw error // an uncertain claim cannot safely authorize a send
  }
  try {
    await send()
    await model.updateOne({ _id, status: 'claimed' }, { $set: { status: 'sent' } })
    return { sent: true }
  } catch (error) {
    // A failed acknowledgement may follow successful delivery. Never release
    // this claim automatically; diagnostics deliberately omit message content.
    await model.updateOne({ _id }, { $set: { status: 'uncertain' } }).catch(() => {})
    throw error
  }
}
