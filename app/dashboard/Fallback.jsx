import Link from 'next/link'

function Fallback() {
    return (
        <div className="min-h-[92vh] flex flex-col items-center p-12 border-b border-borderColor justify-center">
            <h1 className="text-3xl font-bold mb-4 text-textColor">
                Access Denied
            </h1>
            <div className="text-xs text-lightColor mb-8 w-xs text-center">
                You do not have permission to access this dashboard. Please ensure you have an active subscription or contact support for assistance.
            </div>
            <div className="w-full max-w-md flex flex-col">
                <div className="border border-borderColor rounded p-6 flex flex-col items-center">
                    <span className="text-xs font-medium text-lightColor  ">
                        Return to{' '}
                        <Link href="/" className="text-textColor hover:underline">
                            home page
                        </Link>
                    </span>
                </div>
            </div>
        </div>
    )
}

export default Fallback