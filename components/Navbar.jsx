'use client'
import Link from 'next/link'
import Logo from './Logo'
import { useUser } from '@clerk/nextjs'
import Image from 'next/image'

function Navbar() {
    const { user, isLoaded } = useUser()
    return (
        <div className='flex w-full h-16 border-b border-borderColor items-center justify-between px-8 z-50'>
            <Link href='/' className='hidden lg:flex text-textColor text-lg font-bold tracking-widest opacity-50 hover:opacity-80 transition-opacity duration-300 ease-in-out'>
                <Logo
                    width={40}
                    height={40}
                />
            </Link>

            <ul className='hidden lg:flex gap-6 flex-row items-center font-normal'>
                <li><Link href='/shop' className='flex navbarLink'>Shop</Link></li>
                <li><Link href='/prints' className='flex navbarLink'>Prints</Link></li>
                <li><Link href='/creators' className='flex navbarLink'>Creators</Link></li>
                <li><Link href='/shop' className='flex navbarLink'>About</Link></li>
            </ul>

            <div className='hidden lg:flex  w-7 h-7 rounded-full overflow-hidden'>
                <Image
                    src={isLoaded && user ? user.imageUrl : '/user.jpg'}
                    alt='User Avatar'
                    width={40}
                    height={40}
                    className='w-full h-full object-cover grayscale'
                />
            </div>
        </div>
    )
}

export default Navbar