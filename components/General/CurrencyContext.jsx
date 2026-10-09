'use client';
import React, { createContext, useContext, useState, useEffect } from "react";
import { detectDisplayCurrency } from "@/lib/displayCurrency";

const CurrencyContext = createContext("SGD");

export function CurrencyProvider({ children }) {
    const [currency, setCurrency] = useState("SGD");

    useEffect(() => {
        let active = true;
        let storage;
        try { storage = window.localStorage; } catch { /* Storage is optional. */ }
        detectDisplayCurrency({ storage }).then(value => { if (active) setCurrency(value); });
        return () => { active = false; };
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
