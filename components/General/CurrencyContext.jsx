'use client';
import React, { createContext, useContext, useState, useEffect } from "react";
import { supportedCountries } from "@/lib/supportedCountries";

const CurrencyContext = createContext("SGD");

export function CurrencyProvider({ children }) {
    const [currency, setCurrency] = useState("SGD");

    useEffect(() => {
        async function detectCurrency() {
            try {
                const res = await fetch("https://ipapi.co/json/");
                const data = await res.json();
                const countryCode = data.country;
                const found = supportedCountries.find(c => c.code === countryCode);
                setCurrency(found?.currency || "SGD");
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