'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAnalyticsConsent } from './AnalyticsConsentProvider';
import { loadGoogleTag, denyGoogleAnalytics, queueGooglePurchase } from '@/lib/googleTagClient';
import { createGooglePurchaseDispatcher } from '@/lib/googlePurchaseDraft';
import { readAnalyticsConsent } from '@/lib/analyticsConsent';

const Context = createContext({ ready: false, dispatchPurchase: async () => false });
export const useGoogleMeasurement = () => useContext(Context);

export default function GoogleMeasurementProvider({ children }) {
    const { consent } = useAnalyticsConsent();
    const [ready, setReady] = useState(false);
    const dispatcher = useRef(null);
    useEffect(() => {
        let current = true;
        if (consent === 'accepted') loadGoogleTag().then(value => { if (current) setReady(value); }).catch(() => { if (current) setReady(false); });
        else { denyGoogleAnalytics(); setReady(false); }
        return () => { current = false; };
    }, [consent]);
    const dispatchPurchase = useCallback(purchase => {
        try {
            dispatcher.current ||= createGooglePurchaseDispatcher({
                enabled: true, configurationApproved: true, storage: window.localStorage,
                getConsent: () => readAnalyticsConsent(window.localStorage),
                tagReady: () => window.__fitGoogleMeasurement?.ready === true,
                send: queueGooglePurchase,
                withLock: (key, run) => window.navigator.locks?.request ? window.navigator.locks.request(key, run) : run(),
            });
            return dispatcher.current(purchase);
        } catch { return Promise.resolve(false); }
    }, []);
    return <Context.Provider value={{ ready: ready && consent === 'accepted', dispatchPurchase }}>{children}</Context.Provider>;
}
