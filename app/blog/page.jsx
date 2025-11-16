import Blog from "./Blog";

export const metadata = {
    title: "Blog | Fix It Today®",
    description: "Blog for Fix It Today®",
    openGraph: {
        title: "Blog | Fix It Today®",
        description: "Check out our Fix It Today® blog for the latest updates and stories.",
        url: "https://fixitoday.com/blog",
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

function BlogLayout() {
    return (
        <Blog />
    )
}

export default BlogLayout