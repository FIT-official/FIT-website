import SignInPage from "./SignInPage";
import { subscriptionPriceId } from '@/lib/subscriptionIntent';
import { advancedClassesReturn } from '@/lib/advancedClasses/signInReturn';

export const metadata = {
    title: "Sign In | Fix It Today®",
    description: "Log in to your account to continue using Fix It Today®",
    openGraph: {
        title: "Sign In | Fix It Today®",
        description: "Log in to your account to continue using Fix It Today®",
        url: "https://fixitoday.com/sign-in",
        siteName: "Fix It Today®",
        images: [
            {
                url: "/fitogimage.jpg",
                width: 800,
                height: 800,
                alt: "Fix It Today® Photo",
            },
        ],
        locale: "en_SG",
        type: "website",
    },
};

async function SignInLayout({ searchParams }) {
    const params = await searchParams;
    const priceId = subscriptionPriceId(params?.priceId);
    return (
        <SignInPage priceId={priceId} returnTo={advancedClassesReturn(params?.redirect_url)} />
    )
}

export default SignInLayout
