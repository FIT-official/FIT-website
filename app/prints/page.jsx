import PrintPage from "./PrintPage";

export const metadata = {
    title: "Print | Fix It Today®",
    description: "Browse and purchase print products from Fix It Today®",
    openGraph: {
        title: "Print | Fix It Today®",
        description: "Browse and purchase print products from Fix It Today®",
        url: "https://fixitoday.com/prints",
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

function PrintLayout() {
    return (
        <PrintPage />
    )
}

export default PrintLayout
