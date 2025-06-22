'use client'
import { useUser } from '@clerk/nextjs'
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

function SubscriptionDetails() {
    const stripe = useStripe()
    const elements = useElements()
    const router = useRouter()
    const { user, isLoaded } = useUser()
    const [loading, setLoading] = useState(false)
    const [priceId, setPriceId] = useState('')

    useEffect(() => {
        const fetchSubscription = async () => {
            const res = await fetch('/api/user/subscription')
            if (res.ok) {
                const data = await res.json()
                setPriceId(data?.priceId)
            } else {
                console.error('Failed to fetch subscription:', res.statusText)
            }
        }
        fetchSubscription()
    }, [user, isLoaded])

    const updateSubscription = async (e) => {
        e.preventDefault();
        if (!isLoaded && !user) return null
        let cardToken = ''
        setLoading(true);

        try {
            if (!elements || !stripe) {
                return
            }
            const cardEl = elements.getElement(CardElement)
            if (cardEl) {
                const tokenRes = await stripe?.createToken(cardEl)
                cardToken = tokenRes?.token?.id || ''
            }
            await user.update({
                unsafeMetadata: {
                    ...user.unsafeMetadata,
                    cardToken: cardToken,
                    priceId: priceId
                }
            })
            const res = await fetch('/api/user/subscription/edit', { method: 'POST' })
            if (res.ok) {
                const data = await res.json()
                setLoading(false);
                router.push(`/account/subscription/success?id=${data?.subscriptionId}`)
            }
        } catch (error) {
            console.error('Error updating subscription:', error);
        }
    }

    return (
        <>
            <form className='flex flex-col gap-2 w-80' onSubmit={updateSubscription}>
                <div className='flex p-2 w-full flex-col bg-white'>
                    <CardElement />
                </div>
                {/* tier element */}
                <div className='flex gap-2'>
                    <label>Select Tier</label>
                    <div className="flex flex-col gap-1">
                        <label>
                            <input
                                type="radio"
                                name="tier"
                                value="price_1RYmMAQ8qkF9EYSxkjocLoII"
                                checked={priceId === "price_1RYmMAQ8qkF9EYSxkjocLoII"}
                                onChange={(e) => setPriceId(e.target.value)}
                            />
                            Basic
                        </label>
                        <label>
                            <input
                                type="radio"
                                name="tier"
                                value="price_1RYmL7Q8qkF9EYSx0qQSc8zE"
                                checked={priceId === "price_1RYmL7Q8qkF9EYSx0qQSc8zE"}
                                onChange={(e) => setPriceId(e.target.value)}
                            />
                            Hobbyist
                        </label>
                        <label>
                            <input
                                type="radio"
                                name="tier"
                                value="price_1RYmMwQ8qkF9EYSxJskJvmYC"
                                checked={priceId === "price_1RYmMwQ8qkF9EYSxJskJvmYC"}
                                onChange={(e) => setPriceId(e.target.value)}
                            />
                            Advanced
                        </label>
                        <label>
                            <input
                                type="radio"
                                name="tier"
                                value="price_1RYmNXQ8qkF9EYSxFGHrQ4ZB"
                                checked={priceId === "price_1RYmNXQ8qkF9EYSxFGHrQ4ZB"}
                                onChange={(e) => setPriceId(e.target.value)}
                            />
                            Professional
                        </label>
                    </div>
                </div>
                <button className='border py-2 mt-4 cursor-pointer'
                    type="submit"
                >
                    {loading ? 'Updating...' : 'Update Subscription'}
                </button>
            </form>
        </>
    )
}

export default SubscriptionDetails