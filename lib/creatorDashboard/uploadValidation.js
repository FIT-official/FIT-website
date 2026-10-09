import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parseStlToPositions } from '@/lib/quoting/stl';
import { DashboardError } from './flags';
export const MB = 1024 * 1024;
export const UPLOAD_LIMITS = { stl: 100 * MB, '3mf': 100 * MB, step: 50 * MB, stp: 50 * MB };
export const CONSENT_VERSION = '2026-10-10';
export const CONSENT_TEXT = 'I own this design or have the right to have it printed. FIT uses it only to quote and fulfil this order and deletes it under the approved retention policy.';
export const SCAN_ENGINE = 'EICAR signature stand-in; full ClamAV scan pending FIT Bridge';
const bad = message => { throw new DashboardError(message, 400); };
export const safeFilename = name => String(name || '').split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._ ()-]/g, '_').slice(-160);
export function validateUploadRequest({ files, ipConsent }, previous = { count: 0, bytes: 0 }) {
    if (ipConsent !== true) throw new DashboardError('Confirm your right to print these files', 400);
    if (!Array.isArray(files) || !files.length || files.length + previous.count > 10) bad('A job allows up to 10 files');
    const checked = files.map(file => {
        const filename = safeFilename(file.filename), ext = filename.toLowerCase().split('.').pop();
        if (!Object.hasOwn(UPLOAD_LIMITS, ext)) bad('Use STL, 3MF or STEP files');
        if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 1 || file.sizeBytes > UPLOAD_LIMITS[ext]) throw new DashboardError('File exceeds its size limit', 413);
        return { filename, ext, sizeBytes: file.sizeBytes, contentType: ext === '3mf' ? 'model/3mf' : ext === 'stl' ? 'model/stl' : 'model/step' };
    });
    if (checked.reduce((sum, file) => sum + file.sizeBytes, previous.bytes) > 300 * MB) throw new DashboardError('A job allows up to 300 MB', 413);
    return checked;
}

// Bounded ZIP decoder. Inspect central and local headers before any decompression;
// maxOutputLength also bounds entries that lie about their uncompressed length.
export function readSafe3mf(bytes) {
    if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) bad('This is not a 3MF ZIP file');
    let end = -1;
    for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
        if (bytes.readUInt32LE(p) === 0x06054b50 && p + 22 + bytes.readUInt16LE(p + 20) === bytes.length) { end = p; break; }
    }
    if (end < 0) bad('Invalid ZIP directory');
    const count = bytes.readUInt16LE(end + 10), directorySize = bytes.readUInt32LE(end + 12), offset = bytes.readUInt32LE(end + 16);
    if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== count || !count || count > 1000 || offset + directorySize !== end) bad('Unsupported or oversized ZIP directory');
    let cursor = offset, total = 0;
    const entries = [], names = new Set();
    for (let n = 0; n < count; n++) {
        if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) bad('Invalid ZIP entry');
        const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
        const compressed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24);
        const nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
        const local = bytes.readUInt32LE(cursor + 42);
        if (cursor + 46 + nameLength + extra + comment > end || (flags & 1) || ![0, 8].includes(method) || size > 64 * MB || (total += size) > 256 * MB || size > Math.max(1, compressed) * 200) bad('Unsafe ZIP size, compression or encryption');
        const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
        if (!name || /[\\\x00-\x1f:]/.test(name) || name.startsWith('/') || name.split('/').includes('..') || names.has(name.toLowerCase())) bad('Unsafe ZIP path');
        if (/\.(exe|dll|com|bat|cmd|ps1|vbs|js|mjs|cjs|sh|py|php|html?|svg|scr|msi)$/i.test(name)) bad('Executables and scripts are not allowed in 3MF');
        names.add(name.toLowerCase());
        if (local + 30 > offset || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 8) !== method || bytes.readUInt16LE(local + 6) !== flags) bad('Invalid ZIP local header');
        const localName = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28);
        const start = local + 30 + localName + localExtra;
        if (start + compressed > offset || bytes.subarray(local + 30, local + 30 + localName).toString('utf8') !== name) bad('ZIP headers do not match');
        entries.push({ name, method, size, compressed, start });
        cursor += 46 + nameLength + extra + comment;
    }
    if (cursor !== end || !names.has('[content_types].xml') || !entries.some(entry => /^3d\/.*\.model$/i.test(entry.name))) bad('3MF model structure is missing');
    return entries.map(entry => {
        let data;
        try { const source = bytes.subarray(entry.start, entry.start + entry.compressed); data = entry.method === 0 ? source : inflateRawSync(source, { maxOutputLength: Math.max(1, entry.size) }); }
        catch { bad('ZIP expansion exceeds its declared size or is corrupt'); }
        if (data.length !== entry.size) bad('ZIP size mismatch');
        if (/\.(xml|model|rels)$/i.test(entry.name) && /<!DOCTYPE|<!ENTITY|<script[\s>]/i.test(data.toString('utf8'))) bad('Unsafe XML in 3MF');
        return { name: entry.name, data };
    });
}
function meshStats(positions) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    let signedVolume = 0;
    for (let i = 0; i < positions.length; i += 3) for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], positions[i + axis]); max[axis] = Math.max(max[axis], positions[i + axis]);
    }
    for (let i = 0; i < positions.length; i += 9) {
        const [a, b, c, d, e, f, g, h, j] = Array.from(positions.slice(i, i + 9));
        signedVolume += a * (e * j - f * h) + b * (f * g - d * j) + c * (d * h - e * g);
    }
    return { bbox: { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] }, volumeCm3: Math.abs(signedVolume) / 6000 };
}
export function validateUploadBytes(bytes, record) {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const common = { sha256, scanEngine: SCAN_ENGINE };
    // Deliberately minimal stand-in, not a claim of comprehensive malware scanning.
    const infected = data => data.includes(Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'));
    if (infected(bytes)) return { ...common, scanStatus: 'infected' };
    if (bytes.length !== record.sizeBytes || bytes.length > UPLOAD_LIMITS[record.ext]) throw new DashboardError('Uploaded size does not match the reservation', 413);
    if (record.ext === 'stl') {
        const positions = parseStlToPositions(bytes);
        if (!positions) bad('Invalid binary or ASCII STL structure');
        return { ...common, scanStatus: 'clean', ...meshStats(positions) };
    }
    if (record.ext === '3mf') {
        const entries = readSafe3mf(bytes);
        if (entries.some(entry => infected(entry.data))) return { ...common, scanStatus: 'infected' };
        const model = entries.find(entry => /^3d\/.*\.model$/i.test(entry.name));
        if (!/<model[\s>]/i.test(model.data.toString('utf8')) || !/<\/model\s*>/i.test(model.data.toString('utf8'))) bad('Invalid 3MF model');
        const png = entries.find(entry => entry.name.toLowerCase() === 'metadata/plate_1.png')?.data;
        const thumbnail = png && png.length >= 24 && png.length <= 2 * MB && png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && png.readUInt32BE(16) <= 4096 && png.readUInt32BE(20) <= 4096 ? png : null;
        return { ...common, scanStatus: 'clean', ...(thumbnail ? { thumbnail } : {}) };
    }
    const step = bytes.toString('utf8');
    if (!/^\s*ISO-10303-21\s*;/i.test(step) || !/END-ISO-10303-21\s*;\s*$/i.test(step)) bad('STEP must have an ISO-10303-21 header and terminator');
    return { ...common, scanStatus: 'clean', needsConversion: true };
}
