import SignUpPage from "./SignUpPage";

export const metadata = {
    title: "Sign Up | Fix It Today®",
    description: "Create your account to start using Fix It Today®",
    openGraph: {
        title: "Sign Up | Fix It Today®",
        description: "Create your account to start using Fix It Today®",
        url: "https://fixitoday.com/sign-up",
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

function SignUpLayout() {
    return (
        <SignUpPage />
    )
}

export default SignUpLayout
