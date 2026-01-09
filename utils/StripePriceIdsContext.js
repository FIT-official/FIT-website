"use client"
import React, { createContext, useContext, useEffect, useState } from 'react';

const StripePriceIdsContext = createContext(null);

export function StripePriceIdsProvider({ children }) {
  const [stripePriceIds, setStripePriceIds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchPriceIds() {
      setLoading(true);
      try {
        const res = await fetch('/api/stripe/price-ids');
        if (!res.ok) throw new Error('Failed to fetch Stripe price IDs');
        const data = await res.json();
        if (isMounted) {
          setStripePriceIds(data.priceIds || {});
          setError(null);
        }
      } catch (err) {
        if (isMounted) setError(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchPriceIds();
    return () => { isMounted = false; };
  }, []);

  return (
    <StripePriceIdsContext.Provider value={{ stripePriceIds, loading, error }}>
      {children}
    </StripePriceIdsContext.Provider>
  );
}

export function useStripePriceIds() {
  return useContext(StripePriceIdsContext);
}
