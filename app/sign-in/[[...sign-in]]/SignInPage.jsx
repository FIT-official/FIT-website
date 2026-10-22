'use client'

import SignInForm from "@/components/AuthComponents/SignInForm";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { subscriptionIntentTarget } from '@/lib/subscriptionIntent';
import { advancedClassesReturn } from '@/lib/advancedClasses/signInReturn';

function SignInPage({ priceId, returnTo }) {
    const { isSignedIn, isLoaded } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            router.replace(subscriptionIntentTarget(priceId, advancedClassesReturn(returnTo) || '/dashboard'));
        }
    }, [isLoaded, isSignedIn, router, priceId, returnTo]);

    return (
        <div className='flex w-full items-center h-[92vh] justify-center border-b border-borderColor px-8'>
            <SignInForm priceId={priceId} returnTo={returnTo} />
        </div>
    )
}

export default SignInPage
