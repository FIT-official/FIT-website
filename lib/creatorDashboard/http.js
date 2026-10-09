import { NextResponse } from 'next/server';
export const dashboardJson = (value, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
export const dashboardError = error => dashboardJson({ error: error.status ? error.message : 'Unable to complete this request' }, error.status || 500);
export async function dashboardDb() {
    const { connectToDatabase } = await import('@/lib/db');
    return connectToDatabase();
}
