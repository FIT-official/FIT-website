import EditProductPage from "./EditProductPage";

export const metadata = {
    title: "Edit Product | Fix It Today®",
    description: "Edit your product details with Fix It Today®",
    openGraph: {
        title: "Edit Product | Fix It Today®",
        description: "Edit your product details with Fix It Today®",
        url: "https://fixitoday.com/dashboard/products/edit/[id]",
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

function EditProductLayout() {
    return <EditProductPage />;
}

export default EditProductLayout;