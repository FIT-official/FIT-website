import { useEffect, useState } from "react";
import { getEntitlements } from "./entitlements";
import { useAccessContext } from "./AccessContext";
import { useUserRole } from "./UserRoleContext";
import { useUserSubscription } from "./UserSubscriptionContext";
import { useStripePriceIds } from "./StripePriceIdsContext";

export default function useAccess() {
    // Every hook runs unconditionally (rules of hooks); the optional
    // AccessContext override only decides which result is returned.
    const context = useAccessContext();
    const { role, loading: roleLoading } = useUserRole() || {};
    const { subscription, loading: subLoading } = useUserSubscription() || {};
    const { stripePriceIds, loading: priceIdsLoading } = useStripePriceIds() || {};
    const [canAccess, setCanAccess] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const hasOverride = !!(context && typeof context.loading !== "undefined");

    useEffect(() => {
        if (hasOverride) return;
        if (roleLoading || subLoading || priceIdsLoading) {
            setLoading(true);
            return;
        }
        async function checkAccess() {
            const priceId = subscription?.priceId;
            const { isAdmin: adminFlag, canAccessDashboard } = await getEntitlements({ role, priceId, priceIds: stripePriceIds, planId: subscription?.planId, status: subscription?.status });
            setIsAdmin(adminFlag);
            setCanAccess(!!canAccessDashboard);
            setLoading(false);
        }
        checkAccess();
    }, [hasOverride, role, roleLoading, subscription, subLoading, stripePriceIds, priceIdsLoading]);

    if (hasOverride) {
        return {
            loading: context.loading,
            canAccess: context.canAccess,
            isAdmin: context.isAdmin,
        };
    }
    return { loading, canAccess, isAdmin };
}
