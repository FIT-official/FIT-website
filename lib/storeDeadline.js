// Bound external reads. Mutations require durable idempotency instead of
// assuming that a timeout means the operation did not happen.
export async function storeDeadline(promise, timeoutMs = 8000) {
    let timer;
    try {
        return await Promise.race([promise, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Store service timed out')), timeoutMs);
        })]);
    } finally { clearTimeout(timer); }
}
