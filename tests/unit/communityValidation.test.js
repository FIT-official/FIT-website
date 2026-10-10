// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { contentFields, entryId, newContent, pageFilter, plainText, revision } from '@/lib/community/validate'
import { communityPost, communityComment } from '../fixtures/communityMemory'
describe('bounded community input', () => {
  it('normalises text without interpreting HTML or markdown', () => { const body=communityPost({body:'  <script>no executable content</script>\r\n**plain text**  '}); expect(newContent(body,'question').body).toBe('<script>no executable content</script>\n**plain text**') })
  it.each(['', 'a', 'x'.repeat(41), 'name@example.com', 'https://example.com', 'First\nLast', 'maker\u202e'])('rejects unsuitable public name %j', displayName => expect(()=>newContent(communityPost({displayName}),'question')).toThrow())
  it.each(['', 'x'.repeat(19), 'x'.repeat(6001), 'This includes a hidden\u0000 character.'])('rejects invalid post body', body => expect(()=>newContent(communityPost({body}),'question')).toThrow())
  it.each(['', 'four', 'x'.repeat(121)])('rejects invalid post title', title => expect(()=>newContent(communityPost({title}),'question')).toThrow())
  it('enforces separate comment size and denies post-only fields', () => {
    expect(newContent(communityComment({body:'OK'}),'comment').body).toBe('OK')
    expect(()=>newContent(communityComment({body:'x'.repeat(2001)}),'comment')).toThrow()
    expect(()=>newContent(communityComment({title:'Hidden field'}),'comment')).toThrow()
  })
  it('preserves non-Latin maker names and content',()=>expect(contentFields({displayName:'制作朋友',body:'分享一个小项目。'.repeat(4),title:'一个新的制作项目',topic:'general'},'project').displayName).toBe('制作朋友'))
  it.each(['', 'not-an-id', '{$ne:null}', null, 123])('rejects invalid identities %j', id => expect(()=>entryId(id)).toThrow())
  it('normalises UUID case',()=>{const id=randomUUID();expect(entryId(id.toUpperCase())).toBe(id)})
  it.each([0,-1,1.5,'1',null,100001])('requires a bounded integer revision %j',value=>expect(()=>revision(value)).toThrow())
  it('rejects object injection and hidden directional controls',()=>{expect(()=>plainText({$ne:''},'text',0,10)).toThrow();expect(()=>plainText('a\u2066b','text',0,10)).toThrow()})
  it('rejects oversized page cursors and invalid dates',()=>{for(const cursor of ['x'.repeat(91),'invalid|'+randomUUID(),'2026-13-09T00:00:00.000Z|'+randomUUID(),'2026-02-30T00:00:00.000Z|'+randomUUID()])expect(()=>pageFilter(new URLSearchParams({cursor}),{})).toThrow()})
})
