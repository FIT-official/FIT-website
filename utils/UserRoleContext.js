"use client"
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';

const UserRoleContext = createContext(null);

export function UserRoleProvider({ children }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const [role, setRole] = useState(null);
  const [roleUserId, setRoleUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setRole(null);
    setError(null);
    setLoading(!isLoaded || Boolean(isSignedIn));
    if (!isLoaded || !isSignedIn) return;
    async function fetchRole() {
      setLoading(true);
      try {
        const res = await fetch('/api/user/role');
        if (!res.ok) throw new Error('Failed to fetch user role');
        const data = await res.json();
        if (isMounted) {
          setRole(data.role || 'user');
          setRoleUserId(user?.id);
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
  }, [isLoaded, isSignedIn, user?.id]);

  return React.createElement(UserRoleContext.Provider, {
    value: { role: isSignedIn && roleUserId === user?.id ? role : null, loading, error },
  }, children);
}

export function useUserRole() {
  return useContext(UserRoleContext);
}
