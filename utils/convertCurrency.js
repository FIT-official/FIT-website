'use client';
import { useCurrency } from "@/components/General/CurrencyContext";
import { useState, useEffect } from "react";

async function convertToGlobalCurrency(amount, fromCurrency, globalCurrency) {
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

export function useConvertedPrice(amount, fromCurrency) {
    const globalCurrency = useCurrency();
    const [converted, setConverted] = useState(amount);

    useEffect(() => {
        let isMounted = true;
        async function convert() {
            const result = await convertToGlobalCurrency(amount, fromCurrency, globalCurrency);
            if (isMounted) setConverted(result);
        }
        convert();
        return () => { isMounted = false; };
    }, [amount, fromCurrency, globalCurrency]);

    return [converted, globalCurrency];
}