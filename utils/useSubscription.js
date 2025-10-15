import { useEffect, useState } from "react";

export default function useSubscription() {
    const [subscription, setSubscription] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchSubscription = async () => {
            try {
                const res = await fetch('/api/user/subscription');

                if (res.ok) {
                    const data = await res.json();
                    setSubscription(data);
                    setError(null);
                } else if (res.status === 404) {
                    setSubscription(null);
                    setError(null);
                } else {
                    setSubscription(null);
                    setError('Failed to fetch subscription');
                }
            } catch (e) {
                console.error('Error fetching subscription:', e);
                setSubscription(null);
                setError(e.message || 'Unknown error');
            } finally {
                setLoading(false);
            }
        };

        fetchSubscription();
    }, []);

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
