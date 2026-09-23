'use client'

import SignInForm from "@/components/AuthComponents/SignInForm";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { subscriptionIntentTarget } from '@/lib/subscriptionIntent';

function SignInPage({ priceId }) {
    const { isSignedIn, isLoaded } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            router.replace(subscriptionIntentTarget(priceId, '/dashboard'));
        }
    }, [isLoaded, isSignedIn, router, priceId]);

    return (
        <div className='flex w-full items-center h-[92vh] justify-center border-b border-borderColor px-8'>
            <SignInForm priceId={priceId} />
        </div>
    )
}

export default SignInPage
