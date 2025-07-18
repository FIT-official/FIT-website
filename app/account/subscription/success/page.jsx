'use client'

import { useToast } from "@/components/General/ToastProvider"
import { useUser } from "@clerk/nextjs"
import Link from "next/link"
import { useEffect, useState } from "react"


function SubscriptionChangeSuccess() {
    const { user, isLoaded } = useUser()
    const [pendingUpdate, setPendingUpdate] = useState(false)
    const [expiryDate, setExpiryDate] = useState('')
    const { showToast } = useToast();

    useEffect(() => {
        if (!isLoaded || !user) return
        const fetchSubscription = async () => {
            try {
                const res = await fetch('/api/user/subscription')
                if (res.ok) {
                    const data = await res.json()
                    setPendingUpdate(data.pending_update || false)
                    setExpiryDate(data.pending_update_expiry ? new Date(data.pending_update_expiry * 1000).toLocaleDateString() : '')
                } else {
                    showToast('Failed to fetch subscription: ' + res.statusText, 'error')
                }
            } catch (error) {
                showToast('Failed to fetch subscription: ' + error, 'error')
            }
        }
        fetchSubscription()
    }, [user, isLoaded])

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