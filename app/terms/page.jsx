import TermsPage from "./TermsPage";

export const metadata = {
    title: "Terms of Service | Fix It Today®",
    description: "Review our terms of service and user agreements.",
    openGraph: {
        title: "Terms of Service | Fix It Today®",
        description: "Review our terms of service and user agreements.",
        url: "https://fixitoday.com/terms",
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

function TermsLayout() {
    return (
        <TermsPage />
    )
}

export default TermsLayout