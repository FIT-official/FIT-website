export default async function handler(req, res) {
    const { amount, fromCurrency, toCurrency } = req.query;
    const API_KEY = process.env.EXCHANGE_RATE_API_KEY;
    if (!API_KEY || !amount || !fromCurrency || !toCurrency) {
        return res.status(400).json({ error: "Missing parameters" });
    }
    try {
        const url = `https://v6.exchangerate-api.com/v6/${API_KEY}/pair/${fromCurrency}/${toCurrency}/${amount}`;
        const response = await fetch(url);
        const data = await response.json();
        res.status(200).json({ result: data.result });
    } catch (err) {
        res.status(500).json({ error: "Currency conversion failed" });
    }
}