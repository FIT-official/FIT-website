import { useUserSubscription } from "./UserSubscriptionContext";

export default function useSubscription() {
    const { subscription, loading, error } = useUserSubscription();
    const hasActiveSubscription = subscription?.status === 'active' || subscription?.status === 'trialing';
    const isAdmin = subscription?.role === 'admin';
    return {
        subscription,
        loading,
        error,
        hasActiveSubscription,
        isAdmin
    };
}
