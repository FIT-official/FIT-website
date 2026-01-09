"use client"
import React, { createContext, useContext, useEffect, useState } from "react";

const AdminSettingsContext = createContext(null);

export function AdminSettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
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
  }, []);

  return (
    <AdminSettingsContext.Provider value={{ settings, loading, error }}>
      {children}
    </AdminSettingsContext.Provider>
  );
}

export function useAdminSettings() {
  return useContext(AdminSettingsContext);
}
