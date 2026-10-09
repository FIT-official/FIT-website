// Read-only audit. --output must point outside the repository: its report
// contains editorial URLs that must never be committed to the public source.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';

export function collectBlogLinks(post, base) {
    const links = new Set();
    const add = value => {
        try {
            const url = new URL(value, base);
            if (url.hostname.replace(/^www\./, '') !== new URL(base).hostname.replace(/^www\./, '')) return;
            const match = url.pathname.match(/^\/blog\/([^/]+)\/?$/);
            if (match && match[1] !== 'feed.xml') links.add(decodeURIComponent(match[1]));
        } catch { /* Invalid content link; not an internal blog target. */ }
    };
    const walk = node => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'link' || node.type === 'definition') add(node.url);
        if (node.type === 'html' || node.type === 'htmlBlock') {
            const html = node.type === 'htmlBlock' ? node.attrs?.html || '' : node.value;
            for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) add(match[1]);
        }
        if (node.type === 'link' && node.attrs?.href) add(node.attrs.href);
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(walk);
            else if (value && typeof value === 'object') walk(value);
        }
    };
    if (post.contentFormat === 'tiptap' && post.contentJson) walk(post.contentJson);
    else walk(unified().use(remarkParse).parse(post.content || ''));
    if (post.cta?.url) add(post.cta.url);
    return [...links];
}

export async function auditPublicBlog(base, fetcher = fetch) {
    const request = async url => {
        const response = await fetcher(url, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`Public read failed (${response.status})`);
        return response.json();
    };
    const list = await request(new URL('/api/blog', base));
    const published = new Set((list.posts || []).map(post => post.slug));
    const targets = new Map();
    const issues = [];
    for (const entry of list.posts || []) {
        const { post } = await request(new URL(`/api/blog/${encodeURIComponent(entry.slug)}`, base));
        for (const target of collectBlogLinks(post, base)) {
            if (published.has(target)) continue;
            if (!targets.has(target)) {
                const response = await fetcher(new URL(`/blog/${encodeURIComponent(target)}`, base), { signal: AbortSignal.timeout(20000) });
                const html = await response.text();
                if (response.status >= 500) throw new Error('Target read temporarily unavailable; rerun the audit');
                targets.set(target, response.status === 404 || /<title>Article unavailable|404\s*-\s*Page Not Found/i.test(html));
            }
            if (targets.get(target)) issues.push({ source: entry.slug, target,
                evidence: 'Link stored in published content; target unavailable to public readers',
                decision: 'Remove the link, or replace it with a relevant published article. Keep target visibility unchanged.' });
        }
    }
    return { checkedAt: new Date().toISOString(), base, publishedPosts: published.size,
        visibility: 'Public availability only; draft, hidden and absent records cannot be distinguished without database access.', issues };
}

export async function main(args = process.argv.slice(2)) {
    const outputIndex = args.indexOf('--output');
    const baseIndex = args.indexOf('--base');
    if (outputIndex < 0 || !args[outputIndex + 1]) throw new Error('Provide --output outside the repository');
    const output = path.resolve(args[outputIndex + 1]);
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const relative = path.relative(root, output);
    if (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw new Error('The report must be outside the repository');
    const report = await auditPublicBlog(baseIndex < 0 ? 'https://www.fixitoday.com' : args[baseIndex + 1]);
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(`Checked ${report.publishedPosts} published posts; ${report.issues.length} links need editorial decisions. Report saved outside the repository.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
