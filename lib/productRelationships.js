// Coalesce cards rendered in the same browser turn. Do not cache across users
// or retain viewer data after the response; cards own their cancellation.
let pending = [];
let scheduled = false;

export function loadProductRelationship(productId) {
    return new Promise(resolve => {
        pending.push({ productId, resolve });
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(async () => {
            const batch = pending;
            pending = [];
            scheduled = false;
            const ids = [...new Set(batch.map(entry => entry.productId))];
            for (let offset = 0; offset < ids.length; offset += 100) {
                const chunk = ids.slice(offset, offset + 100);
                let products = [];
                try {
                    const params = new URLSearchParams({ ids: chunk.join(','), fields: 'likes,creatorUserId' });
                    const response = await fetch(`/api/product?${params}`);
                    if (response.ok) {
                        const data = await response.json();
                        if (Array.isArray(data?.products)) products = data.products.filter(product => product?._id);
                    }
                } catch { /* Failed cards retain their public seed. */ }
                const byId = new Map(products.map(product => [String(product._id), product]));
                for (const entry of batch) {
                    if (chunk.includes(entry.productId)) entry.resolve(byId.get(entry.productId) || null);
                }
            }
        });
    });
}
