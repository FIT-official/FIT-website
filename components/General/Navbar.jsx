'use client'
import Link from 'next/link'
import Logo from '../Logo'
import { SignOutButton, SignInButton, useUser, SignUpButton } from '@clerk/nextjs'
import Image from 'next/image'
import { FcMenu } from "react-icons/fc";
import { useState } from 'react'
import { PiSignIn, PiSignOut } from "react-icons/pi";
import { GoChevronRight } from 'react-icons/go'
import AccountDropdown from './AccountDropdown'
import { PRINT_CATEGORIES, SHOP_CATEGORIES, PRINT_SUBCATEGORIES, SHOP_SUBCATEGORIES } from '@/lib/categories'
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useSearchParams } from 'next/navigation'
import { HiOutlineShoppingCart } from 'react-icons/hi'
import { LuPlus } from 'react-icons/lu'

function Navbar() {
    const { user, isLoaded, isSignedIn } = useUser();
    const [isOpen, setIsOpen] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [dropdownType, setDropdownType] = useState(null);
    const [mobileDropdown, setMobileDropdown] = useState(null);
    const [openShopCategory, setOpenShopCategory] = useState(null);
    const [openPrintCategory, setOpenPrintCategory] = useState(null);
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
                <Link href='/' className=' text-textColor text-lg font-bold tracking-widest  hover:opacity-80 transition-opacity duration-300 ease-in-out z-10'>
                    <Logo
                        width={30}
                        height={30}
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

                <div className='flex gap-6 items-center'>
                    {isSignedIn && isLoaded && user && (
                        <Link href={`/cart?redirect=${encodeURIComponent(currentUrl)}`} className='hover:text-textColor transition-colors duration-300 ease-in-out'>
                            <HiOutlineShoppingCart size={16} />
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
                                    <div key={category} className='flex flex-col row-span-1 col-span-1 gap-8'>
                                        <p className='font-semibold text-xs tracking-wider uppercase'>{category}</p>
                                        {/* <div className='w-10 border-t border-borderColor flex' /> */}
                                        <ul className='flex flex-col gap-1 tracking-wider uppercase font-medium'>
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
                    <div className='flex flex-row mt-8 w-full items-center gap-6 px-8 min-w-0'>
                        <div className="flex items-center justify-center rounded-full overflow-hidden w-12 h-12 min-w-12">
                            <Link href="/account" className="block w-full h-full">
                                <Image
                                    src={user?.imageUrl || '/user.jpg'}
                                    alt="User Avatar"
                                    width={64}
                                    height={64}
                                    className="object-cover"
                                    style={{ width: '100%', height: '100%', borderRadius: '50%' }}
                                />
                            </Link>
                        </div>
                        <div className='flex flex-col w-full items-start'>

                            <div className='flex w-full text-lg font-semibold overflow-hidden'>
                                {!isLoaded
                                    ? (<div className='block h-6 animate-pulse bg-lightColor' />)
                                    : user
                                        ? user.firstName || user.emailAddresses[0]?.emailAddress
                                        : 'Guest'}
                            </div>
                            {isSignedIn && isLoaded && user ? (
                                <div className='flex flex-row items-center gap-1 cursor-pointer w-full'>
                                    <PiSignOut />
                                    <SignOutButton>
                                        Log Out
                                    </SignOutButton>
                                </div>
                            ) : (
                                <div className='flex flex-row items-center gap-1 cursor-pointer w-full'>
                                    <PiSignIn />
                                    <SignUpButton>
                                        Sign Up
                                    </SignUpButton>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className='flex w-full h-0 border-t border-borderColor mt-8' />
                    <div className='flex flex-col w-full h-full pt-8 pb-24 px-8 justify-between'>
                        <ul className='flex w-full gap-4 flex-col items-start font-normal'>

                            {/* SHOP Dropdown */}
                            <li className='w-full flex flex-col'>
                                <button
                                    className='flex navSidebarLink w-full justify-between items-center'
                                    onClick={() => setMobileDropdown(mobileDropdown === 'shop' ? null : 'shop')}
                                >
                                    Shop
                                    <GoChevronRight size={16} className={mobileDropdown === 'shop' ? 'rotate-90 transition' : 'transition'} />
                                </button>
                                <AnimatePresence>
                                    {mobileDropdown === 'shop' && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.3, ease: "easeInOut" }}
                                            className="pl-2 pr-4 pt-4 max-h-[60vh] overflow-y-auto w-full"
                                        >
                                            {SHOP_CATEGORIES.map((category, catIdx) => (
                                                <div key={category} className="mb-2 w-full">
                                                    <button
                                                        className="font-medium uppercase text-xs  justify-between text-lightColor mb-1 w-full text-left py-2 flex-row flex items-center"
                                                        onClick={() =>
                                                            setOpenShopCategory(openShopCategory === category ? null : category)
                                                        }
                                                    >
                                                        {category}
                                                        <LuPlus
                                                            className={`flex ml-2 transition-transform ${openShopCategory === category ? 'rotate-45' : ''}`}
                                                        />
                                                    </button>
                                                    <AnimatePresence>
                                                        {openShopCategory === category && (
                                                            <motion.ul
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: "auto", opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                                                className="pl-2"
                                                            >
                                                                {SHOP_SUBCATEGORIES[catIdx].map(subcategory => (
                                                                    <li key={subcategory}>
                                                                        <Link
                                                                            href={`/shop?productType=shop&productCategory=${category}&productSubCategory=${subcategory}`}
                                                                            className="text-lightColor text-xs py-1 block"
                                                                        >
                                                                            {subcategory}
                                                                        </Link>
                                                                    </li>
                                                                ))}
                                                            </motion.ul>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </li>
                            <div className='flex w-full h-0 border-t border-borderColor my-1' />

                            {/* PRINT Dropdown */}
                            <li className='flex w-full flex-col'>
                                <button
                                    className='flex navSidebarLink w-full justify-between items-center'
                                    onClick={() => setMobileDropdown(mobileDropdown === 'prints' ? null : 'prints')}
                                >
                                    Prints
                                    <GoChevronRight size={16} className={mobileDropdown === 'prints' ? 'rotate-90 transition' : 'transition'} />
                                </button>
                                <AnimatePresence>
                                    {mobileDropdown === 'prints' && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.3, ease: "easeInOut" }}
                                            className="pl-2 pr-4 pt-4 max-h-[60vh] overflow-y-auto w-full"
                                        >
                                            {PRINT_CATEGORIES.map((category, catIdx) => (
                                                <div key={category} className="mb-2 w-full">
                                                    <button
                                                        className="font-medium uppercase text-xs  justify-between text-lightColor mb-1 w-full text-left py-2 flex-row flex items-center"
                                                        onClick={() =>
                                                            setOpenPrintCategory(openPrintCategory === category ? null : category)
                                                        }
                                                    >
                                                        {category}
                                                        <LuPlus
                                                            className={`flex ml-2 transition-transform ${openPrintCategory === category ? 'rotate-45' : ''}`}
                                                        />
                                                    </button>
                                                    <AnimatePresence>
                                                        {openPrintCategory === category && (
                                                            <motion.ul
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: "auto", opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                                                className="pl-2"
                                                            >
                                                                {PRINT_SUBCATEGORIES[catIdx].map(subcategory => (
                                                                    <li key={subcategory}>
                                                                        <Link
                                                                            href={`/prints?productType=prints&productCategory=${category}&productSubCategory=${subcategory}`}
                                                                            className="text-lightColor text-xs py-1 block"
                                                                        >
                                                                            {subcategory}
                                                                        </Link>
                                                                    </li>
                                                                ))}
                                                            </motion.ul>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </li>

                            <div className='flex w-full h-0 border-t border-borderColor my-1' />

                            <li><Link href='/creators' className='flex navSidebarLink'>Creators</Link></li>
                            <div className='flex w-full h-0 border-t border-borderColor my-1' />
                            <li><Link href='/about' className='flex navSidebarLink'>About</Link></li>
                            <div className='flex w-full h-0 border-t border-borderColor my-1' />
                            {isSignedIn && isLoaded && user && (
                                <>
                                    <li><Link href='/cart' className='flex navSidebarLink'>Cart</Link></li>
                                    <div className='flex w-full h-0 border-t border-borderColor my-1' />
                                    <li><Link href='/account' className='flex navSidebarLink'>Account</Link></li>
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