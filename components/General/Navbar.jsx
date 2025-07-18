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
import { PRINT_CATEGORIES, SHOP_CATEGORIES, PRINT_SUBCATEGORIES, SHOP_SUBCATEGORIES } from '@/lib/categories'
import { AnimatePresence, motion } from "framer-motion";
import { IoCartOutline } from 'react-icons/io5'
import { usePathname, useSearchParams } from 'next/navigation'

function Navbar() {
    const { user, isLoaded, isSignedIn } = useUser();
    const [isOpen, setIsOpen] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [dropdownType, setDropdownType] = useState(null);
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentUrl = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');



    const handleMenu = () => {
        setIsOpen((prev) => !prev);
    }

    if (!isLoaded) {
        return (
            <div className="flex w-full h-16 border-b border-borderColor items-center justify-between px-8 z-50 relative" />
        );
    }

    return (
        <div className='flex relative w-full'>
            <div className='hidden lg:flex w-full h-16 border-b border-borderColor items-center justify-between px-8 z-50 relative'>
                <Link href='/' className=' text-textColor text-lg font-bold tracking-widest opacity-50 hover:opacity-80 transition-opacity duration-300 ease-in-out z-10'>
                    <Logo
                        width={40}
                        height={40}
                    />
                </Link>

                <ul className='flex gap-6 flex-row items-center font-normal z-10'>
                    <li
                        className='flex navbarLink relative cursor-pointer'
                        onMouseEnter={() => { setDropdownOpen(true); setDropdownType('shop'); }}
                        onMouseLeave={() => setDropdownOpen(false)}
                    >
                        Shop
                    </li>
                    <li
                        className='flex navbarLink relative cursor-pointer'
                        onMouseEnter={() => { setDropdownOpen(true); setDropdownType('prints'); }}
                        onMouseLeave={() => setDropdownOpen(false)}
                    >
                        Prints
                    </li>
                    <li className='flex navbarLink'><Link href='/creators'>Creators</Link></li>
                    <li className='flex navbarLink'><Link href='/about'>About</Link></li>
                </ul>

                <div className='flex gap-6 items-center text-lightColor'>
                    {isSignedIn && isLoaded && user && (
                        <Link href={`/cart?redirect=${encodeURIComponent(currentUrl)}`} className='hover:text-textColor transition-colors duration-300 ease-in-out'>
                            <IoCartOutline size={22} />
                        </Link>
                    )}
                    <AccountDropdown />
                </div>



                <AnimatePresence>
                    {dropdownOpen && (
                        <motion.div
                            key={dropdownType}
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.25, ease: "easeInOut" }}
                            className='flex w-full min-h-[30vh] bg-background absolute top-0 left-0 z-0 border-b border-borderColor py-24 px-12 drop-shadow-sm'
                            onMouseEnter={() => setDropdownOpen(true)}
                            onMouseLeave={() => setDropdownOpen(false)}
                            style={{ pointerEvents: dropdownOpen ? 'auto' : 'none' }}
                        >
                            <div className={`flex flex-row gap-16 h-full w-full`}>
                                {(dropdownType === 'shop' ? SHOP_CATEGORIES : PRINT_CATEGORIES).map((category, catIdx) => (
                                    <div key={category} className='flex flex-col row-span-1 col-span-1 gap-6'>
                                        <p className='font-semibold text-xs tracking-wider uppercase'>{category}</p>
                                        {/* <div className='w-10 border-t border-borderColor flex' /> */}
                                        <ul className='flex flex-col gap-3 tracking-wider uppercase font-medium'>
                                            {(dropdownType === 'shop'
                                                ? SHOP_SUBCATEGORIES[catIdx]
                                                : PRINT_SUBCATEGORIES[catIdx]
                                            ).map((subcategory, subIdx) => (
                                                <li key={subcategory}>
                                                    <Link
                                                        href={`/${dropdownType}?productType=${dropdownType}&productCategory=${category}&productSubCategory=${subcategory}`}
                                                        className='flex hover:text-textColor transition-colors duration-300 ease-in-out text-lightColor text-[10px]'
                                                    >
                                                        {subcategory}
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

            </div>

            <div className='flex fixed left-0 top-0 lg:hidden bg-background w-full h-16 border-b border-borderColor items-center justify-between px-8 z-50'>
                <button onClick={handleMenu} className='cursor-pointer z-10'>
                    <FcMenu size={20} />
                </button>
                <div className={`fixed flex flex-col top-0 left-0 w-[80vw] h-screen z-0 bg-background transition-transform duration-300 pt-16 ease-in-out border-r border-borderColor ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:hidden`}>
                    <div className='flex flex-row mt-8 items-center gap-6 px-8'>
                        <div className='w-16 h-16 rounded-full overflow-hidden flex'>
                            <Link href='/account'>
                                <Image
                                    src={user?.imageUrl || '/user.jpg'}
                                    alt='User Avatar'
                                    width={40}
                                    height={40}
                                    className='w-full h-full object-cover grayscale'
                                />
                            </Link>
                        </div>
                        <div className='flex flex-col gap-1 items-start'>
                            <div className='text-textColor font-bold text-xl truncate w-50'>
                                {!isLoaded
                                    ? (<div className='w-full block h-6 animate-pulse bg-lightColor' />)
                                    : user
                                        ? user.firstName || user.emailAddresses[0]?.emailAddress
                                        : 'Guest'}
                            </div>
                            {isSignedIn && isLoaded && user ? (
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
                        <ul className='flex w-full gap-4 flex-col items-start font-normal'>
                            <li><Link href='/shop' className='flex navSidebarLink'>Shop</Link></li>
                            <div className='flex w-full h-0 border-t border-borderColor my-1' />
                            <li><Link href='/prints' className='flex navSidebarLink'>Prints</Link></li>
                            <div className='flex w-full h-0 border-t border-borderColor my-1' />
                            <li><Link href='/creators' className='flex navSidebarLink'>Creators</Link></li>
                            <div className='flex w-full h-0 border-t border-borderColor my-1' />
                            <li><Link href='/shop' className='flex navSidebarLink'>About</Link></li>
                            <div className='flex w-full h-0 border-t border-borderColor my-1' />
                            {isSignedIn && isLoaded && user && (
                                <>
                                    <li><Link href='/cart' className='flex navSidebarLink'>Cart</Link></li>
                                    <div className='flex w-full h-0 border-t border-borderColor my-1' />
                                </>
                            )}
                        </ul>
                        <Link href='/dashboard' className='flex flex-row justify-between items-center bg-textColor py-3 rounded-lg text-sm font-semibold px-4 text-background w-full '>
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