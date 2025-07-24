import Subscription from "./Subscription";

export const metadata = {
    title: "Subscription | Fix It Today®",
    description: "Manage your subscription for Fix It Today®",
    openGraph: {
        title: "Subscription | Fix It Today®",
        description:
            "Manage your subscription for Fix It Today®",
        url: "https://fixitoday.com/account/subscription",
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

function SubscriptionLayout() {
    return (
        <Subscription />
    )
}

export default SubscriptionLayout
