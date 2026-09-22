// The AWS signing test uses fake credentials locally; it sends no network request.
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/s3', async () => {
  const { S3Client } = await import('@aws-sdk/client-s3')
  return { s3: new S3Client({ region: 'ap-southeast-1', credentials: { accessKeyId: 'EXAMPLE', secretAccessKey: 'example-secret-for-local-tests-only' }, requestChecksumCalculation: 'WHEN_REQUIRED' }) }
})
import { signModelUpload, validateModelUpload } from '@/lib/modelUpload'

describe('direct model upload constraints', () => {
  const body = { filename: 'part.stl', contentType: 'model/stl', fileSize: 1024 }
  it('requires an allowed extension and a positive bounded integer length', () => {
    for (const fileSize of [0, -1, 1.5, 25 * 1024 * 1024 + 1, undefined]) expect(validateModelUpload({ ...body, fileSize }).error).toBeTruthy()
    expect(validateModelUpload({ ...body, filename: 'part.zip' }).error).toBeTruthy()
    expect(validateModelUpload({ ...body, fileSize: 25 * 1024 * 1024 }).error).toBeUndefined()
    expect(validateModelUpload({ ...body, filename: 'part.glb' }, true).error).toBeUndefined()
  })
  it('signs the actual content length and content type and scopes the key to the owner', async () => {
    process.env.NEXT_PUBLIC_S3_BUCKET_NAME = 'local-signature-test'
    const first = await signModelUpload('user_owner', body)
    const url = new URL(first.url)
    expect(first.key).toMatch(/^models\/user_owner\//)
    expect(url.searchParams.get('X-Amz-SignedHeaders').split(';')).toEqual(expect.arrayContaining(['content-length', 'content-type']))
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
  })
})
