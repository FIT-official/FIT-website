"use client"
import React, { createContext, useContext, useEffect, useState } from "react";
import { useUser } from '@clerk/nextjs';
import { useUserRole } from './UserRoleContext';

const AdminSettingsContext = createContext(null);

export function AdminSettingsProvider({ children }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { role, loading: roleLoading } = useUserRole() || {};
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setSettings(null);
    setError(null);
    setLoading(!isLoaded || (Boolean(isSignedIn) && Boolean(roleLoading)));
    if (!isLoaded || !isSignedIn || roleLoading || role !== 'admin') return;
    async function fetchSettings() {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/settings");
        if (!res.ok) throw new Error("Failed to fetch admin settings");
        const data = await res.json();
        if (isMounted) {
          setSettings(data);
          setError(null);
        }
      } catch (err) {
        if (isMounted) setError(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchSettings();
    return () => { isMounted = false; };
  }, [isLoaded, isSignedIn, user?.id, role, roleLoading]);

  return React.createElement(AdminSettingsContext.Provider, {
    value: { settings: isSignedIn && role === 'admin' ? settings : null, loading, error },
  }, children);
}

export function useAdminSettings() {
  return useContext(AdminSettingsContext);
}
