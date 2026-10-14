import { createBackorderStore } from './store';
export const backordersEnabled = () => process.env.FIT_SHOP_BACKORDERS_ENABLED === 'true';
export async function backorders() {
    const { connectToDatabase } = await import('@/lib/db');
    const connection = await connectToDatabase();
    return createBackorderStore({ db: connection.connection.db, client: connection.connection.getClient() });
}
