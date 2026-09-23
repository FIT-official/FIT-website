import Onboarding from "./Onboarding";
import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { subscriptionIntentTarget, subscriptionPriceId, withSubscriptionIntent } from '@/lib/subscriptionIntent';

export const metadata = {
    title: "Onboarding | Fix It Today®",
    description: "Onboarding page for Fix It Today®",
    openGraph: {
        title: "Onboarding | Fix It Today®",
        description: "Onboarding page for Fix It Today®",
        url: "https://fixitoday.com/onboarding",
        siteName: "Fix It Today®",
        images: [
            {
                url: "/fitogimage.png",
                width: 800,
                height: 800,
                alt: "Fix It Today® Photo",
            },
        ],
        locale: "en_SG",
        type: "website",
    },
};

async function OnboardingLayout({ searchParams }) {
    const priceId = subscriptionPriceId((await searchParams)?.priceId);
    const { userId, sessionClaims } = await auth();
    if (!userId) redirect(withSubscriptionIntent('/sign-in', priceId));
    const complete = sessionClaims?.metadata?.onboardingComplete === true ||
        (await (await clerkClient()).users.getUser(userId))?.publicMetadata?.onboardingComplete === true;
    if (complete) redirect(subscriptionIntentTarget(priceId, '/dashboard/shop'));
    return (
        <Onboarding priceId={priceId} />
    )
}

export default OnboardingLayout;
