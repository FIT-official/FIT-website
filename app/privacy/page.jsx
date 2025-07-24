import PrivacyPage from "./PrivacyPage";

export const metadata = {
    title: "Privacy Policy | Fix It Today®",
    description: "Learn about our privacy practices and how we protect your information.",
    openGraph: {
        title: "Privacy Policy | Fix It Today®",
        description: "Learn about our privacy practices and how we protect your information.",
        url: "https://fixitoday.com/privacy",
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

function PrivacyLayout() {
    return (
        <PrivacyPage />
    )
}

export default PrivacyLayout