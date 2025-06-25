'use client'
import Link from 'next/link'
import Logo from '../Logo'
import { SignOutButton, SignInButton, useUser } from '@clerk/nextjs'
import Image from 'next/image'
import { FcMenu } from "react-icons/fc";
import { useState } from 'react'
import { PiSignIn, PiSignOut } from "react-icons/pi";
import { GoChevronRight } from 'react-icons/go'
import AccountDropdown from './AccountDropdown'

function Navbar() {
    const { user, isLoaded } = useUser()
    const [isOpen, setIsOpen] = useState(false);

    const handleMenu = () => {
        setIsOpen((prev) => !prev);
    }

    return (
        <div className='flex relative w-full'>
            <div className='hidden lg:flex w-full h-16 border-b border-borderColor items-center justify-between px-8 z-50'>
                <Link href='/' className=' text-textColor text-lg font-bold tracking-widest opacity-50 hover:opacity-80 transition-opacity duration-300 ease-in-out'>
                    <Logo
                        width={40}
                        height={40}
                    />
                </Link>

                <ul className='flex gap-6 flex-row items-center font-normal'>
                    <li><Link href='/shop' className='flex navbarLink'>Shop</Link></li>
                    <li><Link href='/prints' className='flex navbarLink'>Prints</Link></li>
                    <li><Link href='/creators' className='flex navbarLink'>Creators</Link></li>
                    <li><Link href='/shop' className='flex navbarLink'>About</Link></li>
                </ul>
                <AccountDropdown />
            </div>

            <div className='flex fixed left-0 top-0 lg:hidden bg-background w-full h-16 border-b border-borderColor items-center justify-between px-8 z-50'>
                <button onClick={handleMenu} className='cursor-pointer z-10'>
                    <FcMenu size={20} />
                </button>
                <div className={`fixed flex flex-col top-0 left-0 w-[80vw] h-screen z-0 bg-background transition-transform duration-300 pt-16 ease-in-out border-r border-borderColor ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:hidden`}>
                    <div className='flex flex-row mt-8 items-center gap-6 px-8'>
                        <div className='w-16 h-16 rounded-full overflow-hidden flex'>
                            <Image
                                src={user?.imageUrl || '/user.jpg'}
                                alt='User Avatar'
                                width={40}
                                height={40}
                                className='w-full h-full object-cover grayscale'
                            />
                        </div>
                        <div className='flex flex-col gap-1 items-start'>
                            <div className='text-textColor font-bold text-xl truncate w-50'>
                                {!isLoaded
                                    ? (<div className='w-full block h-6 animate-pulse bg-lightColor' />)
                                    : user
                                        ? user.firstName || user.emailAddresses[0]?.emailAddress
                                        : 'Guest'}
                            </div>
                            {isLoaded && user ? (
                                <div className='flex flex-row items-center gap-1 cursor-pointer'>
                                    <PiSignOut />
                                    <SignOutButton>
                                        Log Out
                                    </SignOutButton>
                                </div>
                            ) : (
                                <div className='flex flex-row items-center gap-1 cursor-pointer'>
                                    <PiSignIn />
                                    <SignInButton>
                                        Sign In
                                    </SignInButton>
                                </div>
                            )}

                        </div>
                    </div>
                    <div className='flex w-full h-0 border-t border-borderColor mt-8' />
                    <div className='flex flex-col w-full h-full pt-8 pb-24 px-8 justify-between'>
                        <ul className='flex w-full gap-4 flex-col items-start font-normal '>
                            <li><Link href='/shop' className='flex navSidebarLink'>Shop</Link></li>
                            <div className='flex w-full h-0 border-t border-borderColor my-1' />
                            <li><Link href='/prints' className='flex navSidebarLink'>Prints</Link></li>
                            <div className='flex w-full h-0 border-t border-borderColor my-1' />
                            <li><Link href='/creators' className='flex navSidebarLink'>Creators</Link></li>
                            <div className='flex w-full h-0 border-t border-borderColor my-1' />
                            <li><Link href='/shop' className='flex navSidebarLink'>About</Link></li>
                            <div className='flex w-full h-0 border-t border-borderColor my-1' />

                        </ul>
                        <Link href='/dashboard' className='flex flex-row justify-between items-center bg-textColor py-3 rounded-lg text-base px-4 text-background w-full '>
                            Dashboard
                            <GoChevronRight size={16} />
                        </Link>
                    </div>

                </div>
            </div >


        </div >

    )
}

export default Navbar