import CreateProduct from "./CreateProduct";

export const metadata = {
    title: "Create Product | Fix It Today®",
    description: "Create a new product with Fix It Today®",
    openGraph: {
        title: "Create Product | Fix It Today®",
        description: "Create a new product with Fix It Today®",
        url: "https://fixitoday.com/dashboard/products/create",
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

function CreateProductLayout() {
    return <CreateProduct />;
}

export default CreateProductLayout;