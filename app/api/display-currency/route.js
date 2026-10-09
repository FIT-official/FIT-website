import { NextResponse } from 'next/server';
import { supportedCountries } from '@/lib/supportedCountries';

// Vercel supplies the visitor's country. Local/unknown locations use the
// store currency. This is a display preference, never a checkout price input.
export function GET(request) {
    const country = request.headers.get('x-vercel-ip-country');
    const currency = supportedCountries.find(entry => entry.code === country)?.currency || 'SGD';
    return NextResponse.json({ currency }, { headers: { 'Cache-Control': 'private, no-store' } });
}
