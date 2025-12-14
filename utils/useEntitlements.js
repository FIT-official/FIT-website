import { useEffect, useState } from "react";
import useSubscription from "./useSubscription";
import { getEntitlements } from "./entitlements";

export default function useEntitlements() {
    const { subscription, loading: subLoading, error: subError } = useSubscription();
    const [role, setRole] = useState(subscription?.role || null);
    const [roleLoading, setRoleLoading] = useState(!subscription); // if no subscription, we'll fetch role
    const [roleError, setRoleError] = useState(null);

    useEffect(() => {
        // If subscription already includes role, no need to fetch it again
        if (subscription?.role) {
            setRole(subscription.role);
            setRoleLoading(false);
            setRoleError(null);
            return;
        }

        let cancelled = false;

        const fetchRole = async () => {
            try {
                setRoleLoading(true);
                const res = await fetch("/api/user/role");
                if (!res.ok) {
                    if (!cancelled) {
                        setRole(null);
                        setRoleError(null);
                    }
                    return;
                }
                const data = await res.json();
                if (!cancelled) {
                    setRole(data.role || "user");
                    setRoleError(null);
                }
            } catch (e) {
                if (!cancelled) {
                    setRole(null);
                    setRoleError(e.message || "Failed to load role");
                }
            } finally {
                if (!cancelled) {
                    setRoleLoading(false);
                }
            }
        };

        fetchRole();

        return () => {
            cancelled = true;
        };
    }, [subscription]);

    const priceId = subscription?.priceId || null;
    const entitlements = getEntitlements({ role, priceId });

    return {
        loading: subLoading || roleLoading,
        error: subError || roleError,
        subscription,
        role: entitlements.isAdmin ? "admin" : role || "user",
        ...entitlements,
    };
}
