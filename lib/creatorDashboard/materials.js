import { loadBulkStock } from '@/lib/bulkFilamentStock';
export function materialRows(rows) {
    const materials = [], issues = [];
    rows.forEach((row, index) => {
        if (!/\b(PLA|PETG|ABS|ASA|TPU|PC|PA|PVA|HIPS)\b/i.test(String(row.material || ''))) return;
        if (!row.product || !row.brand || !row.colour || typeof row.quantity !== 'number' || !Number.isFinite(row.quantity) || row.quantity < 0) {
            issues.push(`Row ${row.sheetRow || index + 2}: incomplete material or invalid quantity`); return;
        }
        materials.push({ sku: String(row.barcode || `row-${index + 2}`), name: String(row.product), brand: String(row.brand),
            material: String(row.material), colour: String(row.colour), sheetQuantity: row.quantity });
    });
    return { materials, issues };
}
export async function readMaterials() {
    const stock = await loadBulkStock();
    return { ...materialRows(stock.rows), source: stock.source, checkedAt: stock.checkedAt };
}
