import DashboardPage from "./DashboardPage";

export const metadata = {
    title: "Dashboard | Fix It Today®",
    description: "Manage your products and orders with Fix It Today®",
    openGraph: {
        title: "Dashboard | Fix It Today®",
        description: "Manage your products and orders with Fix It Today®",
        url: "https://fixitoday.com/dashboard",
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

function DashboardLayout() {
    return <DashboardPage />;
}

export default DashboardLayout