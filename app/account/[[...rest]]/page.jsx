import Account from "./Account";

export const metadata = {
    title: "Account | Fix It Today®",
    description: "Manage your account settings for Fix It Today®",
    openGraph: {
        title: "Account | Fix It Today®",
        description:
            "Manage your account settings for Fix It Today®",
        url: "https://fixitoday.com/account",
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

function AccountLayout() {
    return (
        <Account />
    )
}

export default AccountLayout