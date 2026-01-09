import { useContext, useEffect, useState } from "react";
import { getEntitlements } from "./entitlements";
import { useAccessContext } from "./AccessContext";
import { useUserRole } from "./UserRoleContext";
import { useUserSubscription } from "./UserSubscriptionContext";
import { useStripePriceIds } from "./StripePriceIdsContext";

export default function useAccess() {
    const context = useAccessContext && useAccessContext();
    if (context && typeof context.loading !== 'undefined') {
        return {
            loading: context.loading,
            canAccess: context.canAccess,
            isAdmin: context.isAdmin,
        };
    }

    // Use shared contexts for role and subscription
    const userRoleCtx = useUserRole() || {};
    const userSubCtx = useUserSubscription() || {};
    const { role, loading: roleLoading } = userRoleCtx;
    const { subscription, loading: subLoading } = userSubCtx;
    const [canAccess, setCanAccess] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const { stripePriceIds, loading: priceIdsLoading } = useStripePriceIds();

    useEffect(() => {
        if (roleLoading || subLoading || priceIdsLoading) {
            setLoading(true);
            return;
        }
        async function checkAccess() {
            const priceId = subscription?.priceId;
            const { isAdmin: adminFlag, canAccessDashboard } = await getEntitlements({ role, priceId, priceIds: stripePriceIds });
            setIsAdmin(adminFlag);
            setCanAccess(!!canAccessDashboard);
            setLoading(false);
        }
        checkAccess();
    }, [role, roleLoading, subscription, subLoading, stripePriceIds, priceIdsLoading]);

    return { loading, canAccess, isAdmin };
}
