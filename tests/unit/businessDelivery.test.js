// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { queueMessage, deliverNotification, notificationState } from '@/lib/business/delivery'
import { eventMessage, businessEvent, OWNER_EMAIL } from '@/lib/business/events'
import { memoryDb } from '../fixtures/businessStore'
const now=new Date('2026-10-11T00:00:00Z')
const message=eventMessage(businessEvent({key:'chat:synthetic',kind:'chat.message.new',source:'website-chat',reference:'synthetic',occurredAt:now,status:'support'}))
async function setup(){const store=memoryDb().collection('queue');const id=await queueMessage(store,'event','email',message,{now});return{store,id}}

it('retains the first immutable snapshot and stable message ID under duplicate enqueue',async()=>{
  const{store,id}=await setup();await queueMessage(store,'event','email',{...message,text:'changed'}, {now})
  expect(store.rows).toHaveLength(1);expect(store.rows[0].message.text).toBe(message.text);expect(store.rows[0].message.messageId).toContain(id)
})
it('allows one sender under concurrent claims and does not re-send accepted notifications',async()=>{
  const{store,id}=await setup(),send=vi.fn(async()=>({status:'accepted',providerId:'synthetic-ack'}))
  await Promise.all(Array.from({length:12},()=>deliverNotification(store,id,send,{now})))
  expect(send).toHaveBeenCalledTimes(1);expect(store.rows[0].status).toBe('accepted')
  await deliverNotification(store,id,send,{now:new Date(+now+86400000)});expect(send).toHaveBeenCalledTimes(1)
})
it('retries explicit rate-limit rejection after backoff, not before',async()=>{
  const{store,id}=await setup(),send=vi.fn().mockResolvedValueOnce({status:'retry',reason:'rate_limit',retryAfterSeconds:120}).mockResolvedValue({status:'accepted'})
  expect((await deliverNotification(store,id,send,{now})).status).toBe('retry')
  await deliverNotification(store,id,send,{now:new Date(+now+119000)});expect(send).toHaveBeenCalledTimes(1)
  expect((await deliverNotification(store,id,send,{now:new Date(+now+120000)})).status).toBe('accepted')
})
it('limits repeated known failures',async()=>{
  const{store,id}=await setup(),send=vi.fn(async()=>({status:'retry',reason:'temporary_rejection'}))
  for(let i=0;i<6;i++)await deliverNotification(store,id,send,{now:new Date(+now+i*86400000)})
  expect(send).toHaveBeenCalledTimes(4);expect(store.rows[0].status).toBe('failed')
})
it('never blindly replays unknown transport outcome or a stale claimed send',async()=>{
  const{store,id}=await setup(),send=vi.fn(async()=>{throw Error('connection lost after write')})
  await deliverNotification(store,id,send,{now});await deliverNotification(store,id,send,{now:new Date(+now+86400000)})
  expect(send).toHaveBeenCalledTimes(1);expect(store.rows[0].status).toBe('uncertain')
  expect(notificationState({status:'sending',leaseUntil:new Date(+now-1)},now)).toBe('uncertain')
})
it('preserves uncertainty when the provider acknowledgement deadline expires',async()=>{
  const{store,id}=await setup(),send=vi.fn(()=>new Promise(()=>{}))
  expect((await deliverNotification(store,id,send,{now,timeoutMs:5})).status).toBe('uncertain')
})
it('blocks corrupted/redirected snapshots before transport',async()=>{
  const{store,id}=await setup(),send=vi.fn();store.rows[0].message.to='unapproved@example.invalid'
  expect((await deliverNotification(store,id,send,{now})).status).toBe('failed');expect(send).not.toHaveBeenCalled()
})
it('rejects recipient injection and subject header injection on enqueue',async()=>{
  const store=memoryDb().collection('queue')
  await expect(queueMessage(store,'a','email',{...message,to:'other@example.invalid'})).rejects.toThrow()
  await expect(queueMessage(store,'a','email',{...message,to:OWNER_EMAIL,subject:'x\r\nBcc: other@example.invalid'})).rejects.toThrow()
})
it('keeps email and Telegram delivery independent',async()=>{
  const{store,id}=await setup();const telegram=await queueMessage(store,'event','telegram',{text:'Synthetic alert',chatId:'123'}, {now})
  await deliverNotification(store,id,async()=>({status:'accepted'}),{now})
  await deliverNotification(store,telegram,async()=>({status:'retry'}),{now})
  expect(store.rows.map(r=>r.status)).toEqual(['accepted','retry'])
})
