import { requireDashboard } from './flags';
const ready = new WeakMap();
// New models never auto-create collections/indexes just by being imported.
// Explicit setup runs only on an enabled write path, before a transaction.
export async function ensureDashboardIndexes(models) {
    requireDashboard({ write: true });
    for (const model of models) {
        let pending = ready.get(model);
        if (!pending) {
            pending = (async () => { await model.createCollection(); await model.createIndexes(); })()
                .catch(error => { ready.delete(model); throw error; });
            ready.set(model, pending);
        }
        await pending;
    }
}
