import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import AppSettings from '@/models/AppSettings';
import { getAppSettingsId } from '@/lib/appSettingsId';
import { publicDeliveryTypes } from '@/lib/publicDeliveryTypes';

export async function GET() {
    try {
        await connectToDatabase();
        const settings = await AppSettings.findById(getAppSettingsId())
            .select('additionalDeliveryTypes.name additionalDeliveryTypes.displayName additionalDeliveryTypes.description additionalDeliveryTypes.isActive')
            .lean();
        return NextResponse.json({ deliveryTypes: publicDeliveryTypes(settings) });
    } catch {
        return NextResponse.json({ error: 'Delivery types temporarily unavailable' }, { status: 503 });
    }
}
