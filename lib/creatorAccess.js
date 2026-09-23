import { getCreatorPlan } from './creatorPlans';

export const GRANT_PLANS = ['student', 'standard', 'pro'];
export const QUOTA_KEYS = ['products', 'monthlyPrintRequests'];

export function activeCreatorGrant(user, now = Date.now()) {
    const grant = user?.privateMetadata?.creatorAccess?.grant;
    if (!grant || !GRANT_PLANS.includes(grant.planId)) return null;
    const expiry = Date.parse(grant.expiresAt || '');
    return Number.isFinite(expiry) && expiry > now ? grant : null;
}

export function creatorQuotaOverrides(user) {
    const raw = user?.privateMetadata?.creatorAccess?.quota || {};
    return Object.fromEntries(QUOTA_KEYS.flatMap(key =>
        Number.isSafeInteger(raw[key]) && raw[key] >= 0 && raw[key] <= 100000
            ? [[key, raw[key]]] : []
    ));
}

export function effectiveCreatorPlan(user, paidPlan, paidStatus, now = Date.now()) {
    const paid = ['active', 'trialing'].includes(paidStatus) && paidPlan.id !== 'free';
    const grant = !paid && paidStatus !== 'unavailable' ? activeCreatorGrant(user, now) : null;
    const basePlan = paid ? paidPlan : grant ? getCreatorPlan(grant.planId) : getCreatorPlan('free');
    const quota = creatorQuotaOverrides(user);
    return {
        plan: { ...basePlan, limits: { ...basePlan.limits, ...quota } },
        grant, quota,
        source: paid ? 'stripe' : grant ? 'complimentary' : 'free',
        status: paid ? paidStatus : grant ? 'complimentary' : paidStatus,
    };
}
