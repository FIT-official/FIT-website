"use client"
import React, { createContext, useContext, useEffect, useState } from 'react';

const UserRoleContext = createContext(null);

export function UserRoleProvider({ children }) {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchRole() {
      setLoading(true);
      try {
        const res = await fetch('/api/user/role');
        if (!res.ok) throw new Error('Failed to fetch user role');
        const data = await res.json();
        if (isMounted) {
          setRole(data.role || 'user');
          setError(null);
        }
      } catch (err) {
        if (isMounted) setError(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchRole();
    return () => { isMounted = false; };
  }, []);

  return (
    <UserRoleContext.Provider value={{ role, loading, error }}>
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole() {
  return useContext(UserRoleContext);
}
