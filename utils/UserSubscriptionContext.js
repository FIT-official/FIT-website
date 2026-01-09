"use client"
import React, { createContext, useContext, useEffect, useState } from 'react';

const UserSubscriptionContext = createContext(null);

export function UserSubscriptionProvider({ children }) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchSubscription() {
      setLoading(true);
      try {
        const res = await fetch('/api/user/subscription');
        if (!res.ok && res.status !== 404) throw new Error('Failed to fetch subscription');
        const data = res.ok ? await res.json() : null;
        if (isMounted) {
          setSubscription(data);
          setError(null);
        }
      } catch (err) {
        if (isMounted) setError(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchSubscription();
    return () => { isMounted = false; };
  }, []);

  return (
    <UserSubscriptionContext.Provider value={{ subscription, loading, error }}>
      {children}
    </UserSubscriptionContext.Provider>
  );
}

export function useUserSubscription() {
  return useContext(UserSubscriptionContext);
}
