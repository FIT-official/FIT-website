const expectedBot = 'wentoassistant_bot'
export async function verifyTelegramDestination({ token, chatId, fetchImpl = fetch } = {}) {
  if (!token || !/^\d{1,20}$/.test(String(chatId || ''))) return { ok: false, reason: 'not_configured' }
  try {
    const call = async (method, body) => {
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(10000) })
      const data = await response.json(); return response.ok && data.ok ? data.result : null
    }
    const bot = await call('getMe'), chat = await call('getChat', { chat_id: String(chatId) })
    return bot?.is_bot && bot.username?.toLowerCase() === expectedBot && chat?.type === 'private' && String(chat.id) === String(chatId)
      ? { ok: true, bot: bot.username, chatId: String(chat.id), username: chat.username || null } : { ok: false, reason: 'destination_mismatch' }
  } catch { return { ok: false, reason: 'identity_check_failed' } }
}

export async function sendTelegramAlert(message, { token, chatId, fetchImpl = fetch } = {}) {
  const identity = await verifyTelegramDestination({ token, chatId, fetchImpl })
  if (!identity.ok) return { status: identity.reason === 'not_configured' ? 'not_configured' : 'failed', reason: identity.reason }
  if (typeof message.text !== 'string' || message.text.length > 3500) return { status: 'failed', reason: 'invalid_message' }
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: String(chatId), text: message.text, link_preview_options: { is_disabled: true } }), signal: AbortSignal.timeout(12000) })
    const data = await response.json()
    if (response.ok && data.ok && String(data.result?.chat?.id) === String(chatId) && data.result?.message_id) return { status: 'accepted', providerId: data.result.message_id }
    if (response.status === 429) return { status: 'retry', reason: 'provider_rate_limit', retryAfterSeconds: data.parameters?.retry_after }
    return { status: response.status >= 400 && response.status < 500 ? 'failed' : 'uncertain', reason: 'provider_response' }
  } catch { return { status: 'uncertain', reason: 'provider_acknowledgement_unknown' } }
}
