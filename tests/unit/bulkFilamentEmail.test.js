// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { notifyBulkOwner, bulkOwnerEmail } from '@/lib/bulkFilamentEmail'
import { parseBulkInput, saveBulkRequest } from '@/lib/bulkFilament'
import { fixtureCatalogue, fixtureInput, memoryStore } from '../fixtures/bulkFilament'
const mail=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/email',()=>({sendEmail:mail}))
afterEach(()=>{vi.unstubAllEnvs();mail.mockReset()})
async function saved() {
  const store=memoryStore(),c=fixtureCatalogue(),input=parseBulkInput(fixtureInput(c))
  await saveBulkRequest(store,input,async()=>c)
  return {store,id:input.clientRequestId}
}
it('sends only to the owner, once, after persistence even under concurrent retries',async()=>{
  vi.stubEnv('GMAIL_USER','synthetic');vi.stubEnv('GMAIL_PASSWORD','synthetic')
  const {store,id}=await saved();mail.mockImplementation(async()=>expect(store.docs.has(id)).toBe(true))
  await Promise.all(Array.from({length:10},()=>notifyBulkOwner(store,id)))
  expect(mail).toHaveBeenCalledOnce();expect(mail.mock.calls[0][0].to).toBe('fixittoday.contact@gmail.com')
  expect(mail.mock.calls[0][0]).not.toHaveProperty('cc');expect(mail.mock.calls[0][0]).not.toHaveProperty('bcc')
  expect(store.docs.get(id).notifications.email).toBe('sent')
})
it('retains the request and records an email failure',async()=>{
  vi.stubEnv('GMAIL_USER','synthetic');vi.stubEnv('GMAIL_PASSWORD','synthetic');mail.mockRejectedValue(Error('SMTP failed'))
  const {store,id}=await saved();await expect(notifyBulkOwner(store,id)).resolves.toBeUndefined()
  expect(store.docs.get(id).notifications.email).toBe('failed');expect(store.docs.size).toBe(1)
})
it('records missing email settings without sending or losing the request',async()=>{
  vi.stubEnv('GMAIL_USER','');vi.stubEnv('GMAIL_PASSWORD','')
  const {store,id}=await saved();await notifyBulkOwner(store,id)
  expect(store.docs.get(id).notifications.email).toBe('not_configured');expect(mail).not.toHaveBeenCalled()
})
it('does not send before persistence or expose unescaped customer HTML',async()=>{
  const store=memoryStore();await notifyBulkOwner(store,'missing');expect(mail).not.toHaveBeenCalled()
  const savedRequest=await saved(),doc=savedRequest.store.docs.get(savedRequest.id)
  doc.customer.name='<img src=x onerror=alert(1)>';doc.notes='<script>bad</script>'
  const email=bulkOwnerEmail(doc)
  expect(email.html).toContain('&lt;img');expect(email.html).not.toContain('<script>')
  expect(email.html).toContain('SGD 29.80');expect(email.html).toContain('band &lt;10')
})
it('a notification status-write failure never rejects the stored submission',async()=>{
  const {store,id}=await saved();store.updateOne=async()=>{throw Error('DB unavailable')}
  await expect(notifyBulkOwner(store,id)).resolves.toBeUndefined();expect(store.docs.has(id)).toBe(true)
})
