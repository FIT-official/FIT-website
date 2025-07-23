export async function convertToGlobalCurrency(amount, fromCurrency, globalCurrency) {
    if (fromCurrency === globalCurrency) return amount;
    try {
        const res = await fetch(
            `https://v6.exchangerate-api.com/v6/${process.env.EXCHANGE_RATE_API_KEY}/pair/${fromCurrency}/${globalCurrency}/${amount}`
        );
        const data = await res.json();
        return Number(data.result).toFixed(2) ?? amount;
    } catch {
        return amount;
    }
}