'use client'
import Link from "next/link"
import { GoChevronRight } from "react-icons/go"

function ButtonLink({ lnk, text }) {
    return (
        <Link href={lnk} className='bg-textColor group font-semibold px-4 py-2 w-fit rounded-lg text-background relative'>
            <span className="relative transition-all duration-300 pr-0 group-hover:pr-3">
                {text}
            </span>
            <GoChevronRight
                className='absolute right-2 top-1/2 -translate-y-1/2 opacity-0 pointer-events-none translate-x-2 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-x-0 transition-all duration-300 ease-in-out'
                size={16}
            />
        </Link>
    )
}

export default ButtonLink