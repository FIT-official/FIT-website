'use client'
import SignInForm from "@/components/AuthComponents/SignInForm";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

function SignInPage() {
    const { isSignedIn, isLoaded } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            router.replace("/dashboard");
        }
    }, [isLoaded, isSignedIn, router]);

    return (
        <div className='flex w-full items-center h-[92vh] justify-center border-b border-borderColor px-8'>
            <SignInForm />
        </div>
    )
}

export default SignInPage