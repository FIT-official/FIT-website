'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { readAnalyticsConsent, writeAnalyticsConsent } from '@/lib/analyticsConsent';

const Context = createContext({ consent: null, openPreferences: () => {} });
export const useAnalyticsConsent = () => useContext(Context);

export default function AnalyticsConsentProvider({ children }) {
    const [consent, setConsent] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const [preferences, setPreferences] = useState(false);
    useEffect(() => {
        const sync = () => {
            try { setConsent(readAnalyticsConsent(window.localStorage)); }
            catch { setConsent(null); }
        };
        sync(); setLoaded(true);
        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
    }, []);
    function decide(choice) {
        // If persistence is blocked, analytics stays disabled.
        let saved = false;
        try { saved = writeAnalyticsConsent(window.localStorage, choice); } catch { /* Storage unavailable. */ }
        setConsent(saved ? choice : 'declined');
        setPreferences(false);
    }
    return <Context.Provider value={{ consent, openPreferences: () => setPreferences(true) }}>
        {children}
        {loaded && (consent === null || preferences) && <section aria-label="Analytics cookie choices"
            className="fixed bottom-4 left-4 right-4 md:left-auto md:max-w-sm z-50 bg-background border border-borderColor rounded-md p-4 shadow-sm">
            <p className="text-sm font-medium mb-2">Optional analytics cookies</p>
            <p className="text-xs text-textColor mb-3">With your permission, Google measures shop purchases and PostHog helps us understand website use. Google receives order ID, value, currency and purchased items, without your email or payment details. <Link href="/privacy" className="underline">Privacy and cookie choices</Link></p>
            <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => decide('declined')} className="text-xs px-3 py-2 border border-borderColor rounded-full hover:bg-baseColor cursor-pointer">Decline</button>
                <button type="button" onClick={() => decide('accepted')} className="text-xs px-3 py-2 bg-textColor text-background rounded-full hover:bg-textColor/90 cursor-pointer">Accept analytics</button>
            </div>
        </section>}
    </Context.Provider>;
}

export function AnalyticsCookieChoices() {
    const { openPreferences } = useAnalyticsConsent();
    return <button type="button" className="underline text-left" onClick={openPreferences}>Change analytics cookie choices</button>;
}
