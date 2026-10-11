// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { verifyTelegramDestination, sendTelegramAlert } from '@/lib/business/telegram'
const ok=result=>({ok:true,status:200,json:async()=>({ok:true,result})})
const bot={is_bot:true,username:'wentoAssistant_bot'}, chat={id:123,type:'private',username:'synthetic'}
const config=fetchImpl=>({token:'synthetic',chatId:'123',fetchImpl})
it('verifies existing bot and private destination before any send',async()=>{
  const fetchImpl=vi.fn().mockResolvedValueOnce(ok(bot)).mockResolvedValueOnce(ok(chat))
  expect((await verifyTelegramDestination(config(fetchImpl))).ok).toBe(true)
  expect(fetchImpl.mock.calls.map(([url])=>url.split('/').at(-1))).toEqual(['getMe','getChat'])
})
it.each([{...chat,type:'group'},{...chat,id:456}])('does not send to an unverified destination',async destination=>{
  const fetchImpl=vi.fn().mockResolvedValueOnce(ok(bot)).mockResolvedValueOnce(ok(destination))
  expect((await sendTelegramAlert({text:'test'},config(fetchImpl))).status).toBe('failed');expect(fetchImpl).toHaveBeenCalledTimes(2)
})
it('refuses a different bot identity',async()=>{
  const fetchImpl=vi.fn().mockResolvedValueOnce(ok({...bot,username:'other_bot'})).mockResolvedValueOnce(ok(chat))
  expect((await sendTelegramAlert({text:'test'},config(fetchImpl))).status).toBe('failed')
})
it('records Telegram provider acceptance without reading message updates',async()=>{
  const fetchImpl=vi.fn().mockResolvedValueOnce(ok(bot)).mockResolvedValueOnce(ok(chat)).mockResolvedValueOnce(ok({chat,message_id:42}))
  expect(await sendTelegramAlert({text:'Synthetic test'},config(fetchImpl))).toEqual({status:'accepted',providerId:42})
  expect(JSON.parse(fetchImpl.mock.calls[2][1].body)).toEqual({chat_id:'123',text:'Synthetic test',link_preview_options:{is_disabled:true}})
})
it('distinguishes rate rejection from unknown network outcome',async()=>{
  const f=vi.fn().mockResolvedValueOnce(ok(bot)).mockResolvedValueOnce(ok(chat)).mockResolvedValueOnce({ok:false,status:429,json:async()=>({ok:false,parameters:{retry_after:12}})})
  expect((await sendTelegramAlert({text:'test'},config(f))).status).toBe('retry')
  const g=vi.fn().mockResolvedValueOnce(ok(bot)).mockResolvedValueOnce(ok(chat)).mockRejectedValueOnce(Error('connection lost'))
  expect((await sendTelegramAlert({text:'test'},config(g))).status).toBe('uncertain')
})
