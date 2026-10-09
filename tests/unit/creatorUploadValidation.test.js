// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { randomBytes, createHmac } from 'node:crypto';
import JSZip from 'jszip';
import { validateUploadRequest, validateUploadBytes, readSafe3mf, MB } from '@/lib/creatorDashboard/uploadValidation';
import { createUploadPost } from '@/lib/creatorDashboard/postPolicy';
const ascii = Buffer.from('solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid t\n');
const record = (ext, bytes) => ({ ext, sizeBytes: bytes.length });
async function zip(extra = {}) {
    const zip = new JSZip(); zip.file('[Content_Types].xml', '<Types/>'); zip.file('3D/3dmodel.model', '<model><resources/></model>');
    for (const [name, data] of Object.entries(extra)) zip.file(name, data);
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
describe('private print upload validation', () => {
    it('requires explicit consent, limits file count and cumulative job bytes', () => {
        expect(() => validateUploadRequest({ files: [{ filename: 'x.stl', sizeBytes: 1 }] })).toThrow('Confirm');
        expect(() => validateUploadRequest({ ipConsent: true, files: Array.from({ length: 11 }, () => ({ filename: 'x.stl', sizeBytes: 1 })) })).toThrow('10 files');
        expect(() => validateUploadRequest({ ipConsent: true, files: [{ filename: 'x.stl', sizeBytes: 100 * MB }] }, { count: 3, bytes: 201 * MB })).toThrow('300 MB');
    });
    it('rejects 120 MB STL and 51 MB STEP and sanitises names', () => {
        for (const [filename, sizeBytes] of [['x.stl', 120 * MB], ['x.step', 51 * MB]]) expect(() => validateUploadRequest({ ipConsent: true, files: [{ filename, sizeBytes }] })).toThrow('size limit');
        expect(validateUploadRequest({ ipConsent: true, files: [{ filename: '../../a<script>.stl', sizeBytes: 100 }] })[0].filename).toBe('a_script_.stl');
    });
    it('binds POST to reserved size, exact content type/key, encryption and <=600s', () => {
        const credentials = { accessKeyId: randomBytes(10).toString('hex'), secretAccessKey: randomBytes(24).toString('hex'), sessionToken: randomBytes(12).toString('hex') };
        const now = new Date('2026-10-09T00:00:00Z');
        const result = createUploadPost({ bucket: 'fixture-private', region: 'ap-southeast-1', credentials, now,
            record: { ext: 'stl', s3Key: 'creator-uploads/quarantine/random-id', sizeBytes: 100 * MB, contentType: 'model/stl' } });
        const policy = JSON.parse(Buffer.from(result.fields.policy, 'base64'));
        expect(policy.conditions).toContainEqual(['content-length-range', 1, 100 * MB]);
        expect(policy.conditions).toContainEqual({ 'Content-Type': 'model/stl' });
        expect(policy.conditions).toContainEqual({ key: 'creator-uploads/quarantine/random-id' });
        expect(policy.conditions).toContainEqual({ 'x-amz-server-side-encryption': 'AES256' });
        expect(new Date(policy.expiration) - now).toBe(600000);
        // Independently reconstruct AWS's four-step HMAC key derivation.
        const sign = (key, data) => createHmac('sha256', key).update(data).digest();
        const key = ['20261009', 'ap-southeast-1', 's3', 'aws4_request'].reduce(sign, Buffer.from(`AWS4${credentials.secretAccessKey}`));
        expect(result.fields['x-amz-signature']).toBe(sign(key, result.fields.policy).toString('hex'));
        expect(result.url).toMatch(/^https:\/\/fixture-private\.s3\./);
    });
    it('parses ASCII and binary STL and rejects truncated or nonfinite geometry', () => {
        expect(validateUploadBytes(ascii, record('stl', ascii))).toMatchObject({ scanStatus: 'clean', bbox: { x: 10, y: 10, z: 0 } });
        const binary = Buffer.alloc(134); binary.writeUInt32LE(1, 80); binary.writeFloatLE(10, 108);
        expect(validateUploadBytes(binary, record('stl', binary)).scanStatus).toBe('clean');
        binary.writeFloatLE(NaN, 96); expect(() => validateUploadBytes(binary, record('stl', binary))).toThrow('Invalid');
        expect(() => validateUploadBytes(ascii.subarray(0, 40), record('stl', ascii.subarray(0, 40)))).toThrow();
    });
    it('requires STEP header and terminator and flags conversion', () => {
        const bytes = Buffer.from('ISO-10303-21;\nHEADER;ENDSEC;DATA;ENDSEC;END-ISO-10303-21;');
        expect(validateUploadBytes(bytes, record('step', bytes))).toMatchObject({ scanStatus: 'clean', needsConversion: true });
        expect(() => validateUploadBytes(ascii, record('step', ascii))).toThrow('ISO-10303-21');
    });
    it('rejects an executable renamed 3MF', () => {
        const bytes = Buffer.from('MZ executable'); expect(() => validateUploadBytes(bytes, record('3mf', bytes))).toThrow('3MF ZIP');
    });
    it('rejects zip bombs before inflation and caps entry count', async () => {
        const bytes = await zip(); let central = bytes.indexOf(Buffer.from([80,75,1,2]));
        bytes.writeUInt32LE(1024 * MB + 1, central + 24); expect(() => readSafe3mf(bytes)).toThrow('Unsafe ZIP');
        const many = await zip(); const end = many.length - 22; many.writeUInt16LE(1001, end + 8); many.writeUInt16LE(1001, end + 10);
        expect(() => readSafe3mf(many)).toThrow('oversized ZIP');
    });
    it('rejects script entries, traversal, external entities and missing model structure', async () => {
        for (const extra of [{ 'evil.js': 'alert(1)' }, { '../secret': 'x' }, { 'Metadata/test.xml': '<!ENTITY x SYSTEM "file:///x">' },
            { 'Metadata/readme.txt': 'MZ executable' }, { 'Metadata/helper.dat': '#!/bin/sh\necho test' }, { 'hidden.exe ': 'x' }]) {
            const bytes = await zip(extra); expect(() => readSafe3mf(bytes)).toThrow();
        }
        const bad = new JSZip(); bad.file('readme.txt', 'x'); expect(() => readSafe3mf(Buffer.from('MZ'))).toThrow();
        const bytes = await bad.generateAsync({ type: 'nodebuffer' }); expect(() => readSafe3mf(bytes)).toThrow('structure');
    });
    it('extracts an embedded plate PNG and recognises EICAR inside ZIP entries', async () => {
        const png = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.writeUInt32BE(64, 16); png.writeUInt32BE(64, 20);
        const bytes = await zip({ 'Metadata/plate_1.png': png }); expect(validateUploadBytes(bytes, record('3mf', bytes)).thumbnail).toEqual(png);
        const infected = await zip({ 'Metadata/info.txt': 'EICAR' + '-STANDARD-ANTIVIRUS-TEST-FILE' }); expect(validateUploadBytes(infected, record('3mf', infected)).scanStatus).toBe('infected');
    });
    it('EICAR renamed STL is infected before format parsing', () => {
        const bytes = Buffer.from('EICAR' + '-STANDARD-ANTIVIRUS-TEST-FILE'); expect(validateUploadBytes(bytes, record('stl', bytes)).scanStatus).toBe('infected');
    });
});
