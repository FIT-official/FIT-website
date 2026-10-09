'use client';
import React, { createContext, useContext, useState, useEffect } from "react";
import { supportedCountries } from "@/lib/supportedCountries";

const CurrencyContext = createContext("SGD");

export function CurrencyProvider({ children }) {
    const [currency, setCurrency] = useState("SGD");

    useEffect(() => {
        async function detectCurrency() {
            try {
                const cached = sessionStorage.getItem('fit-display-currency');
                if (supportedCountries.some(country => country.currency === cached)) {
                    setCurrency(cached);
                    return;
                }
                const res = await fetch('/api/display-currency');
                if (!res.ok) return;
                const data = await res.json();
                const detected = supportedCountries.some(country => country.currency === data.currency) ? data.currency : 'SGD';
                setCurrency(detected);
                sessionStorage.setItem('fit-display-currency', detected);
            } catch {
                setCurrency("SGD");
            }
        }
        detectCurrency();
    }, []);

    return (
        <CurrencyContext.Provider value={currency}>
            {children}
        </CurrencyContext.Provider>
    );
}

export function useCurrency() {
    return useContext(CurrencyContext);
}
