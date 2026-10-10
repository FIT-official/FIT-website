import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Parse CSV including quoted commas, escaped quotes and CRLF records. */
export function parseCsv(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (quoted && text[i + 1] === '"') { field += '"'; i++; }
            else quoted = !quoted;
        } else if (!quoted && (char === ',' || char === '\n')) {
            row.push(field.replace(/\r$/, '')); field = '';
            if (char === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
        } else field += char;
    }
    if (quoted) throw new Error('Unterminated CSV quote');
    if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
    const headers = rows.shift().map(value => value.replace(/^\uFEFF/, ''));
    return rows.map(values => {
        if (values.length !== headers.length) throw new Error('Invalid CSV column count');
        return Object.fromEntries(headers.map((key, i) => [key, values[i]]));
    });
}

/** Keep unknown measurements null; never infer a weight from a price or name. */
export function buildWeights(csv, source = 'PRODUCT_WEIGHTS.csv') {
    const products = {};
    for (const row of parseCsv(csv)) {
        const slug = new URL(row.url).pathname.split('/').filter(Boolean).at(-1);
        if (!/^[a-z0-9-]+$/.test(slug) || products[slug]) throw new Error(`Invalid or duplicate slug: ${slug}`);
        if (!['ESTIMATED', 'MISSING'].includes(row.flag)) throw new Error(`Invalid flag: ${slug}`);
        const entry = {};
        for (const key of ['weight_g', 'L_mm', 'W_mm', 'H_mm']) {
            const value = row[key]?.trim();
            entry[key] = value ? Number(value) : null;
            if (value && (!Number.isFinite(entry[key]) || entry[key] <= 0)) throw new Error(`Invalid ${key}: ${slug}`);
            if (!value && row.flag === 'ESTIMATED') throw new Error(`Incomplete estimate: ${slug}`);
        }
        products[slug] = { ...entry, flag: row.flag, source: row.source, notes: row.notes };
    }
    return { version: 1, generatedFrom: basename(source), products };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const input = process.argv[2];
    if (!input) throw new Error('Usage: node scripts/shipping/build-weights.mjs PRODUCT_WEIGHTS.csv [output.json]');
    const output = resolve(process.argv[3] || 'data/shipping/product-weights.v1.json');
    const data = buildWeights(readFileSync(input, 'utf8'), input);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(data, null, 2) + '\n');
    console.log(`Wrote ${Object.keys(data.products).length} shipping entries to ${output}`);
}
