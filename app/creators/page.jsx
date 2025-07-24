import Link from 'next/link'

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

function Creators() {
    return (
        <div className="min-h-[92vh] flex flex-col items-center p-12 border-b border-borderColor justify-center">
            <h1 className="text-3xl font-bold mb-4 text-textColor">Coming soon!</h1>
            <div className="text-xs text-lightColor mb-8 w-xs text-center">
                This page is under construction. We are working hard to bring you the best experience possible. Stay tuned for updates!
            </div>
            <div className="w-full max-w-md flex flex-col">
                <div className="border border-borderColor rounded p-6 flex flex-col items-center">
                    <span className="text-xs font-medium text-lightColor  ">
                        You can return to{' '}
                        <Link href="/" className="text-textColor hover:underline">
                            the home page
                        </Link>.
                    </span>
                </div>
            </div>
        </div>
    )
}

export default Creators
