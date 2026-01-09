import { useEffect, useState } from "react";
import useSubscription from "./useSubscription";
import { getEntitlements } from "./entitlements";
import { useUserRole } from "./UserRoleContext";
import { useUserSubscription } from "./UserSubscriptionContext";
import { useStripePriceIds } from "./StripePriceIdsContext";

export default function useEntitlements() {
    const userRoleCtx = useUserRole() || {};
    const userSubCtx = useUserSubscription() || {};
    const { role, loading: roleLoading, error: roleError } = userRoleCtx;
    const { subscription, loading: subLoading, error: subError } = userSubCtx;
    const priceId = subscription?.priceId || null;
    const { stripePriceIds, loading: priceIdsLoading } = useStripePriceIds();
    const [entitlements, setEntitlements] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (roleLoading || subLoading || priceIdsLoading) {
            setLoading(true);
            return;
        }
        async function fetchEntitlements() {
            try {
                const result = await getEntitlements({ role, priceId, priceIds: stripePriceIds });
                setEntitlements(result);
                setError(null);
            } catch (e) {
                setEntitlements({});
                setError(e.message || 'Failed to get entitlements');
            } finally {
                setLoading(false);
            }
        }
        fetchEntitlements();
    }, [role, roleLoading, priceId, subLoading, stripePriceIds, priceIdsLoading]);

    return {
        loading: loading,
        error: subError || roleError || error,
        subscription,
        role: entitlements.isAdmin ? "admin" : role || "user",
        ...entitlements,
    };
}
