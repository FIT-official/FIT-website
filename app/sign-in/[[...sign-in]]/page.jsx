import SignInPage from "./SignInPage";

export const metadata = {
    title: "Sign In | Fix It Today®",
    description: "Log in to your account to continue using Fix It Today®",
    openGraph: {
        title: "Sign In | Fix It Today®",
        description: "Log in to your account to continue using Fix It Today®",
        url: "https://fixitoday.com/sign-in",
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

function SignInLayout() {
    return (
        <SignInPage />
    )
}

export default SignInLayout
