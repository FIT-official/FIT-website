import Creators from "./Creators";

export const metadata = {
    title: "Creators | Fix It Today®",
    description: "Browse creator subscription packages at Fix It Today®",
    openGraph: {
        title: "Creators | Fix It Today®",
        description: "Browse creator subscription packages at Fix It Today®",
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
    return (
        <Creators/>
    )
}

export default CreatorsPage
