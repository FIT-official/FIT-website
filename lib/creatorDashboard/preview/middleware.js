import { NextResponse } from 'next/server';
import { fixtureMode } from '../flags';
export function fixtureResponse(req) {
    if (!fixtureMode()) return null;
    if (!['GET', 'HEAD'].includes(req.method)) return NextResponse.json({ error: 'Fixture preview is read-only' }, { status: 409 });
    const path = new URL(req.url).pathname;
    if (path.startsWith('/api/')) {
        const fixtures = {
            '/api/content': { frontmatter: {}, content: '' }, '/api/blog': { posts: [] },
            '/api/categories': { categories: [{ _id: 'fixture-filament', name: 'Filament', type: 'shop', isActive: true, subcategories: [] }] },
            '/api/stripe/price-ids': { priceIds: {} }, '/api/settings/public': { categories: [], deliveryTypes: [] },
            '/api/maintenance/status': { banner: { active: false }, page: { active: false } },
        };
        return NextResponse.json(fixtures[path] || { error: 'No local fixture for this endpoint' }, { status: fixtures[path] ? 200 : 404 });
    }
    if (!(path === '/' || path === '/shop' || /^\/(dashboard\/creator|admin\/creator-dashboard)(\/|$)/.test(path) || path.startsWith('/track/'))) return new NextResponse('Not found', { status: 404 });
    const headers = new Headers(req.headers);
    headers.set('x-fit-creator-surface', path.startsWith('/track/') ? 'tracking' : path.startsWith('/dashboard/') || path.startsWith('/admin/') ? 'dashboard' : 'fixture');
    return NextResponse.next({ request: { headers } });
}
