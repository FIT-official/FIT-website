'use client'

import { useToast } from "@/components/General/ToastProvider"
import { useUser } from "@clerk/nextjs"
import Link from "next/link"
import { useEffect, useState } from "react"


import { useUserSubscription } from '@/utils/UserSubscriptionContext';

function SubscriptionChangeSuccess() {
    const { subscription, loading: subLoading, error: subError } = useUserSubscription();
    const [pendingUpdate, setPendingUpdate] = useState(false);
    const [expiryDate, setExpiryDate] = useState('');
    const { showToast } = useToast();

    useEffect(() => {
        if (!subLoading && subscription) {
            setPendingUpdate(subscription.pending_update || false);
            setExpiryDate(subscription.pending_update_expiry ? new Date(subscription.pending_update_expiry * 1000).toLocaleDateString() : '');
        }
    }, [subLoading, subscription]);

    return (
        <div className="min-h-[92vh] flex flex-col items-center p-12 border-b border-borderColor justify-center">
            {pendingUpdate ? (
                <>
                    <h1 className="text-3xl font-bold mb-4 text-textColor">Action Required</h1>

                    <div className="w-full max-w-2xl flex flex-col">
                        <div className="border border-borderColor rounded px-6 py-8 flex flex-col items-center bg-white">
                            <span className="text-xs font-medium text-textColor mb-4 w-xs text-center">
                                Payment failed. Update payment method in Account/Subscription by ${expiryDate}
                            </span>
                            <Link
                                href="/account/subscription"
                                className="formBlackButton mt-2"
                            >
                                Update Payment Method
                            </Link>
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <h1 className="text-3xl font-bold mb-4 text-textColor">Subscription Updated!</h1>

                    <div className="w-full max-w-2xl flex flex-col">
                        <div className="border border-borderColor rounded px-6 py-8 flex flex-col items-center bg-white">
                            <span className="text-xs font-medium text-textColor mb-4 w-xs text-center">
                                Your subscription has been successfully updated. Thank you for being a valued member of FIT!
                            </span>
                            <Link
                                href="/"
                                className="formBlackButton mt-2"
                            >
                                Back to Home
                            </Link>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

export default SubscriptionChangeSuccess