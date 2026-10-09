import { createHmac } from 'node:crypto';
import { DashboardError } from './flags';
import { UPLOAD_LIMITS } from './uploadValidation';
// AWS SigV4 POST policy signing with Node crypto and the existing SDK credential provider.
// https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-HTTPPOSTConstructPolicy.html
export function createUploadPost({ bucket, region, credentials, record, now = new Date() }) {
    if (!record.s3Key.startsWith('creator-uploads/quarantine/') || record.sizeBytes > UPLOAD_LIMITS[record.ext]) throw new DashboardError('Invalid upload reservation');
    const date = now.toISOString().replace(/[:-]|\.\d{3}/g, ''), day = date.slice(0, 8);
    const scope = `${day}/${region}/s3/aws4_request`;
    const fields = { key: record.s3Key, 'Content-Type': record.contentType, 'x-amz-server-side-encryption': 'AES256',
        'x-amz-algorithm': 'AWS4-HMAC-SHA256', 'x-amz-credential': `${credentials.accessKeyId}/${scope}`,
        'x-amz-date': date, success_action_status: '201', ...(credentials.sessionToken ? { 'x-amz-security-token': credentials.sessionToken } : {}) };
    const conditions = [{ bucket }, ...Object.entries(fields).map(([key, value]) => ({ [key]: value })), ['content-length-range', 1, record.sizeBytes]];
    const policy = Buffer.from(JSON.stringify({ expiration: new Date(now.getTime() + 600000).toISOString(), conditions })).toString('base64');
    const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), region), 's3'), 'aws4_request');
    return { url: `https://${bucket}.s3.${region}.amazonaws.com/`, fields: { ...fields, policy, 'x-amz-signature': hmac(signingKey, policy).toString('hex') }, expiresIn: 600, conditions };
}
