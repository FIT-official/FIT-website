'use client'
import Link from "next/link";
import { useEffect, useState } from "react";
import { FaStripe } from "react-icons/fa";
import { GoChevronRight } from "react-icons/go";

function ExpressWidget({ user, isLoaded }) {
    const [accountLink, setAccountLink] = useState(null);
    const [isOnboarded, setIsOnboarded] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const checkOnboardingAndCreateLink = async () => {
            if (user?.publicMetadata?.stripeAccountId) {
                setLoading(true);
                try {
                    // Check onboarding status
                    const res = await fetch(`/api/user/express?stripeAccountId=${user.publicMetadata.stripeAccountId}`);
                    const data = await res.json();
                    const onboarded = data.onboarded === true;
                    setIsOnboarded(onboarded);

                    // Create appropriate link based on onboarding status
                    const res2 = await fetch("/api/user/express", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            stripeAccountId: user.publicMetadata.stripeAccountId,
                            linkType: onboarded ? 'login' : 'onboarding'
                        }),
                    });
                    const data2 = await res2.json();
                    if (data2.url) {
                        setAccountLink(data2.url);
                    }
                } catch (error) {
                    console.error('Error creating account link:', error);
                }
                setLoading(false);
            }
        };
        if (user && isLoaded) checkOnboardingAndCreateLink();
    }, [user, isLoaded]);

    if (isOnboarded === null) return null;

    // Loading state (preparing account link)
    if (loading || !accountLink) {
        return (
            <div className="col-span-4 lg:col-span-1 row-span-1 bg-gradient-to-br from-teal-400 to-purple-400 flex flex-col rounded-md h-fit items-start justify-center p-4 font-medium text-xs text-pretty text-white shadow-lg transition">
                <div className="flex flex-row items-center w-full justify-between gap-4">
                    <FaStripe className="text-5xl" />
                    <div className='animate-spin border-1 border-t-transparent mr-1 h-4 w-4 rounded-full' />
                </div>
                <div className="mt-3">Preparing account link...</div>
            </div>
        );
    }

    // Show appropriate link based on onboarding status
    return (
        <Link
            href={accountLink}
            target="_blank"
            rel="noopener noreferrer"
            className="col-span-4 lg:col-span-1 row-span-1 bg-gradient-to-br from-teal-400 to-purple-400 flex flex-col rounded-md h-fit items-start justify-center p-4 font-medium text-xs text-pretty text-white shadow-lg transition hover:scale-[1.02]"
        >
            <FaStripe className="text-6xl mb-2" />
            {isOnboarded ? (
                "Click to access your Express dashboard to view sales, manage payouts and account settings."
            ) : (
                "Click to complete onboarding with Stripe Express to start selling products."
            )}
            <div className="flex items-center justify-end w-full mt-4">
                <GoChevronRight size={16} />
            </div>
        </Link>
    );
}

export default ExpressWidget