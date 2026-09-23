import CreatorsDirectory from "./CreatorsDirectory";

export const metadata = {
    title: "Creators | Fix It Today®",
    description: "Meet the makers selling on Fix It Today® and browse their pages.",
    openGraph: {
        title: "Creators | Fix It Today®",
        description: "Meet the makers selling on Fix It Today® and browse their pages.",
        url: "https://fixitoday.com/creators",
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

function CreatorsPage() {
    return <CreatorsDirectory />;
}

export default CreatorsPage;
