'use client'
import Link from "next/link";
import { useEffect, useState } from "react";
import { FaStripe } from "react-icons/fa";
import { GoChevronRight } from "react-icons/go";

function ExpressWidget({ user, isLoaded }) {
    const [onboardingLink, setOnboardingLink] = useState(null);
    const [isOnboarded, setIsOnboarded] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const checkOnboarding = async () => {
            if (user?.publicMetadata?.stripeAccountId) {
                setLoading(true);
                const res = await fetch(`/api/user/express?stripeAccountId=${user.publicMetadata.stripeAccountId}`);
                const data = await res.json();
                setIsOnboarded(data.onboarded === true);
                if (data.onboarded === false) {
                    const res2 = await fetch("/api/user/express", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ stripeAccountId: user.publicMetadata.stripeAccountId }),
                    });
                    const data2 = await res2.json();
                    setOnboardingLink(data2.url);
                }
                setLoading(false);
            }
        };
        if (user && isLoaded) checkOnboarding();
    }, [user, isLoaded]);

    if (isOnboarded === null) return null;

    // Loading state (preparing onboarding link)
    if (loading || (isOnboarded === false && !onboardingLink)) {
        return (
            <div className="col-span-4 lg:col-span-1 row-span-1 bg-gradient-to-br from-teal-400 to-purple-400 flex flex-col rounded-md h-fit items-start justify-center p-4 font-medium text-xs text-pretty text-white shadow-lg transition">
                <div className="flex flex-row items-center w-full justify-between gap-4">
                    <FaStripe className="text-5xl" />
                    <div className='animate-spin border-1 border-t-transparent mr-1 h-4 w-4 rounded-full' />
                </div>
                <div className="mt-3">Preparing onboarding link...</div>
            </div>
        );
    }

    // Not onboarded: show onboarding link
    if (isOnboarded === false && onboardingLink) {
        return (
            <Link
                href={onboardingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-4 lg:col-span-1 row-span-1 bg-gradient-to-br from-teal-400 to-purple-400 flex flex-col rounded-md h-fit items-start justify-center p-4 font-medium text-xs text-pretty text-white shadow-lg transition hover:scale-[1.02]"
            >
                <FaStripe className="text-6xl mb-2" />
                Click to complete onboarding with Stripe Express to continue selling products.
                <div className="flex items-center justify-end w-full mt-4">
                    <GoChevronRight size={16} />
                </div>
            </Link>
        );
    }


    return (
        <Link
            href="https://connect.stripe.com/express_login"
            target="_blank"
            rel="noopener noreferrer"
            className="col-span-4 lg:col-span-1 row-span-1 bg-gradient-to-br from-teal-400 to-purple-400 flex flex-col rounded-md h-fit items-start justify-center p-4 font-medium text-xs text-pretty text-white shadow-lg transition hover:scale-[1.02]"
        >
            <FaStripe className="text-6xl mb-2" />
            Click to visit your Express account to access sales data and funds.
            <div className="flex items-center justify-end w-full mt-4">
                <GoChevronRight size={16} />
            </div>
        </Link>
    );


    return null;
}

export default ExpressWidget