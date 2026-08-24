import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { authenticate, unauthorizedResponse } from '@/lib/authenticate';
import { checkAdminPrivileges } from '@/lib/checkPrivileges';
import AppSettings from '@/models/AppSettings';
import { calculatePrintCost } from '@/lib/printPricing';
import { getAppSettingsId } from '@/lib/appSettingsId';

export async function POST(request) {
    let userId;
    try {
        ({ userId } = await authenticate(request));
    } catch {
        return unauthorizedResponse();
    }

    if (!(await checkAdminPrivileges(userId))) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { printSettings, dimensions } = await request.json();
    await connectToDatabase();

    const settings = await AppSettings.findById(getAppSettingsId());
    const formula = settings?.printPricingFormula || {};

    const suggestedPrice = calculatePrintCost(printSettings, dimensions, formula);

    return NextResponse.json({ suggestedPrice });
}
