import React, { createContext, useContext, useEffect, useState } from "react";
import { getEntitlements } from "./entitlements";

const AccessContext = createContext(null);

export function AccessProvider({ children }) {
  const [access, setAccess] = useState({
    loading: true,
    canAccess: null,
    isAdmin: false,
    role: null,
    priceId: null,
    entitlements: {},
  });

  useEffect(() => {
    let cancelled = false;
    async function fetchAccess() {
      try {
        const roleRes = await fetch("/api/user/role");
        let role = null;
        if (roleRes.ok) {
          const roleData = await roleRes.json();
          role = roleData.role;
        }
        const subRes = await fetch("/api/user/subscription");
        let priceId = null;
        if (subRes.ok) {
          const subData = await subRes.json();
          priceId = subData.priceId;
        }
        const entitlements = await getEntitlements({ role, priceId });
        if (!cancelled) {
          setAccess({
            loading: false,
            canAccess: !!entitlements.canAccessDashboard,
            isAdmin: !!entitlements.isAdmin,
            role: role || "user",
            priceId,
            entitlements,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setAccess({
            loading: false,
            canAccess: false,
            isAdmin: false,
            role: null,
            priceId: null,
            entitlements: {},
          });
        }
      }
    }
    fetchAccess();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AccessContext.Provider value={access}>{children}</AccessContext.Provider>
  );
}

export function useAccessContext() {
  return useContext(AccessContext);
}
