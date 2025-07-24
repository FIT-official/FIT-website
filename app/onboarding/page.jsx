import Onboarding from "./Onboarding";

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

function OnboardingLayout() {
    return (
        <Onboarding />
    )
}

export default OnboardingLayout;