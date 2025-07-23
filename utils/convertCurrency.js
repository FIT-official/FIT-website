export async function convertToGlobalCurrency(amount, fromCurrency, globalCurrency) {
    if (fromCurrency === globalCurrency) return amount;
    try {
        const res = await fetch(
            `/api/currency?amount=${amount}&fromCurrency=${fromCurrency}&toCurrency=${globalCurrency}`
        );
        const data = await res.json();
        return Number(data.result).toFixed(2) ?? amount;
    } catch {
        return amount;
    }
}