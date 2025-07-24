import SubscriptionChangeSuccess from "./SubscriptionChangeSuccess";

export const metadata = {
    title: "Subscription Success | Fix It Today®",
    description: "You have successfully updated your subscription for Fix It Today®",
    openGraph: {
        title: "Subscription Success | Fix It Today®",
        description: "You have successfully updated your subscription for Fix It Today®",
        url: "https://fixitoday.com/account/subscription/success",
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

function SubscriptionSuccessLayout() {
    return (
        <SubscriptionChangeSuccess />
    )
}

export default SubscriptionSuccessLayout