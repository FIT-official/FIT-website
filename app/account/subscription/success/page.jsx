'use client'

import { useUser } from "@clerk/nextjs"
import Link from "next/link"
import { useEffect, useState } from "react"

function SubscriptionChangeSuccess() {
    const { user, isLoaded } = useUser()
    const [pendingUpdate, setPendingUpdate] = useState(false)
    const [expiryDate, setExpiryDate] = useState('')

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
                    console.error('Failed to fetch subscription:', res.statusText)
                }
            } catch (error) {
                console.error('Error fetching subscription:', error)
            }
        }
        fetchSubscription()
    }, [user, isLoaded])

    return (
        <div className="flex flex-col items-center justify-center h-screen w-screen">
            {pendingUpdate ? (
                <div>
                    <h1 className="text-2xl font-bold mb-4">Action Required</h1>
                    <p className="text-lg">Payment failed. Update payment method in Account/Subscription by ${expiryDate}</p>
                    <Link href="/account/subscription" className=" hover:underline mt-4">
                        Update Payment Method
                    </Link>
                </div>
            ) : (
                <div>
                    <h1 className="text-2xl font-bold mb-4">Subscription Updated Successfully!</h1>
                    <p className="text-lg">Your subscription has been successfully updated.</p>
                    <p className="text-lg mt-2">You can now enjoy the benefits of your new plan.</p>
                </div>
            )}
        </div>
    )
}

export default SubscriptionChangeSuccess