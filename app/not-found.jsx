'use client'
import Link from 'next/link';

function NotFound() {
    return (
        <div className="min-h-[92vh] flex flex-col items-center p-12 border-b border-borderColor justify-center">
            <h1 className="text-3xl font-bold mb-4 text-textColor">
                404 - Page Not Found
            </h1>
            <div className="text-xs text-lightColor mb-8 w-xs text-center">
                The page you are looking for does not exist. It might have been removed, had its name changed, or is temporarily unavailable.
            </div>
            <div className="w-full max-w-md flex flex-col">
                <div className="border border-borderColor rounded p-6 flex flex-col items-center">
                    <span className="text-xs font-medium text-lightColor  ">
                        You can return to{' '}
                        <Link href="/" className="text-textColor hover:underline">
                            the home page
                        </Link>
                        {' '}to try again.
                    </span>
                </div>
            </div>
        </div>
    )
}

export default NotFound