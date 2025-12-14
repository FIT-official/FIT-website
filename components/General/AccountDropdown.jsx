'use client'
import useAccess from "@/utils/useAccess";
import { SignOutButton, useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function AccountDropdown() {
    const { user, isLoaded } = useUser()
    const { isAdmin } = useAccess();
    const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
    const accountDropdownRef = useRef(null);
    const openAccountDropdown = () => {
        setIsAccountDropdownOpen((prev) => !prev);
    }

    useEffect(() => {
        function handleClickOutside(event) {
            if (
                accountDropdownRef.current &&
                !accountDropdownRef.current.contains(event.target)
            ) {
                setIsAccountDropdownOpen(false);
            }
        }
        if (isAccountDropdownOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        } else {
            document.removeEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isAccountDropdownOpen]);

    return (
        <div className='flex z-10 relative' ref={accountDropdownRef}>

            <button onClick={openAccountDropdown} className='flex w-7 h-7 rounded-full overflow-hidden cursor-pointer border border-borderColor'>
                <Image
                    src={user?.imageUrl || '/user.jpg'}
                    alt='User Avatar'
                    width={40}
                    height={40}
                    className='w-full h-full object-cover grayscale'
                />
            </button>

            <div className={`absolute border border-borderColor top-10 right-0 min-w-40 rounded-sm bg-background transition-all duration-300 ease-in-out drop-shadow-lg ${isAccountDropdownOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                {user && isLoaded ? (
                    <>
                        <Link href='/account' className="accountDropdownLink">
                            Account
                        </Link>
                        <div className="w-full h-0 border-t border-borderColor" />
                        <Link href='/dashboard' className="accountDropdownLink">
                            Dashboard
                        </Link>
                        <div className="w-full h-0 border-t border-borderColor" />
                        {isAdmin && (
                            <Link href='/admin' className="accountDropdownLinkGradient">
                                Admin
                            </Link>
                        )}
                        <div className="w-full h-0 border-t border-borderColor" />
                        <SignOutButton className="accountDropdownLink">
                            Log Out
                        </SignOutButton>
                    </>
                ) : (
                    <>
                        <Link href='/sign-in' className="accountDropdownLink">
                            Sign In
                        </Link>
                        <div className="w-full h-0 border-t border-borderColor" />
                        <Link href='/sign-up' className="accountDropdownLink">
                            Sign Up
                        </Link>
                    </>
                )}
            </div>

        </div>
    )
}

export default AccountDropdown