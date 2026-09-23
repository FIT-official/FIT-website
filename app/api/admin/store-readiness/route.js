import { NextResponse } from 'next/server';
import { authenticate, UnauthorizedError } from '@/lib/authenticate';
import { checkAdminPrivileges } from '@/lib/checkPrivileges';
import { getStoreReadiness } from '@/lib/storeReadiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const response = (body, status = 200) => NextResponse.json(body, {
    status, headers: { 'Cache-Control': 'private, no-store' },
});
const result = (ready, code) => ({ ready, code });

export async function GET(req) {
    try {
        const { userId } = await authenticate(req);
        if (!await checkAdminPrivileges(userId)) return response(result(false, 'forbidden'), 403);
    } catch (error) {
        return error instanceof UnauthorizedError
            ? response(result(false, 'unauthorized'), 401)
            : response(result(false, 'authorization_unavailable'), 503);
    }
    return response(await getStoreReadiness());
}
