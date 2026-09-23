const MM_PER_3MF_UNIT = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };

export function validate3mfArchive(buffer) {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
        if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === bytes.length) { end = offset; break; }
    }
    if (end < 0) throw new Error('The 3MF archive is invalid.');
    const count = view.getUint16(end + 10, true);
    const directorySize = view.getUint32(end + 12, true);
    const directoryStart = view.getUint32(end + 16, true);
    let offset = directoryStart;
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || !count || count > 1024 ||
        view.getUint16(end + 8, true) !== count || offset + directorySize !== end) {
        throw new Error('This 3MF package is too complex to preview. Export a single model as STL.');
    }
    let expanded = 0;
    const files = [];
    const names = new Set();
    for (let entry = 0; entry < count; entry++) {
        if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error('The 3MF file directory is invalid.');
        const uncompressed = view.getUint32(offset + 24, true);
        const flags = view.getUint16(offset + 8, true);
        const method = view.getUint16(offset + 10, true);
        const compressed = view.getUint32(offset + 20, true);
        const start = view.getUint32(offset + 42, true);
        const nameLength = view.getUint16(offset + 28, true);
        const extraLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);
        const next = offset + 46 + nameLength + extraLength + commentLength;
        if (next > end) throw new Error('The 3MF file directory is invalid.');
        const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
        expanded += uncompressed;
        if (uncompressed === 0xffffffff || expanded > 100 * 1024 * 1024 || (/\.model$/i.test(name) && uncompressed > 32 * 1024 * 1024)) {
            throw new Error('This 3MF expands beyond the preview limit. Export a smaller STL model.');
        }
        if (flags & 1 || ![0, 8].includes(method) || !name || /[\\\0]/.test(name) || name.startsWith('/') ||
            name.split('/').includes('..') || names.has(name) || start + 30 > directoryStart ||
            view.getUint32(start, true) !== 0x04034b50 || view.getUint16(start + 6, true) !== flags || view.getUint16(start + 8, true) !== method) {
            throw new Error('The 3MF file directory is invalid.');
        }
        const localNameLength = view.getUint16(start + 26, true);
        const payload = start + 30 + localNameLength + view.getUint16(start + 28, true);
        if (payload + compressed > directoryStart ||
            new TextDecoder().decode(bytes.subarray(start + 30, start + 30 + localNameLength)) !== name) {
            throw new Error('The 3MF file directory is invalid.');
        }
        names.add(name);
        files.push({ name, method, uncompressed, data: bytes.subarray(payload, payload + compressed) });
        offset = next;
    }
    if (offset !== end) throw new Error('The 3MF file directory is invalid.');
    return { entries: count, expandedBytes: expanded, files };
}

export function declared3mfUnit(xml) {
    const unit = /<(?:[\w-]+:)?model\b[^>]*\bunit\s*=\s*['"]([^'"]+)['"]/i.exec(xml)?.[1] || 'millimeter';
    if (!Object.hasOwn(MM_PER_3MF_UNIT, unit)) throw new Error(`Unsupported 3MF unit: ${unit}`);
    return MM_PER_3MF_UNIT[unit];
}

async function readBoundedZipEntry(entry) {
    const isModel = /\.model$/i.test(entry.name);
    if (entry.method === 0) {
        if (entry.data.byteLength !== entry.uncompressed) throw new Error('The 3MF entry size is invalid.');
        return isModel ? new TextDecoder().decode(entry.data) : null;
    }
    let decompressor;
    try { decompressor = new DecompressionStream('deflate-raw'); }
    catch { throw new Error('This browser cannot safely open this 3MF package. Export it as STL or use a current browser.'); }
    let offset = 0;
    // Small input chunks plus backpressure keep decompression bounded; do not
    // hand a full untrusted archive to a buffering unzip helper.
    const source = new ReadableStream({ pull(controller) {
        if (offset === entry.data.length) { controller.close(); return; }
        const end = Math.min(offset + 8192, entry.data.length);
        controller.enqueue(entry.data.subarray(offset, end));
        offset = end;
    } });
    const reader = source.pipeThrough(decompressor).getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let xml = '';
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > entry.uncompressed) throw new Error('The 3MF entry expands beyond its declared size.');
            if (isModel) xml += decoder.decode(value, { stream: true });
        }
        if (total !== entry.uncompressed) throw new Error('The 3MF entry size is invalid.');
        return isModel ? xml + decoder.decode() : null;
    } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    } finally { reader.releaseLock(); }
}

// ThreeMFLoader r178 reads unit but never applies it to its returned group.
// Verify every entry's actual expansion before its synchronous unzip can run.
export async function threeMfMillimetresPerUnit(buffer) {
    const { files } = validate3mfArchive(buffer);
    const scales = [];
    for (const file of files) {
        const xml = await readBoundedZipEntry(file);
        if (xml != null) {
            if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('The 3MF model contains unsupported XML declarations.');
            scales.push(declared3mfUnit(xml));
        }
    }
    if (!scales.length) throw new Error('The 3MF package has no model part.');
    if (scales.some(scale => scale !== scales[0])) {
        throw new Error('This 3MF uses different units across model parts. Export it in millimetres before uploading.');
    }
    return scales[0];
}
