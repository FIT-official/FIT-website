import React from 'react'

function Header(title) {
    return (
        <div className='flex flex-col gap-2 w-full h-48 md:h-64 transition-all duration-300 ease-in-out items-center justify-center relative border-b border-borderColor'>
            <div className='absolute w-full h-full left-0 top-0 z-0 grid grid-cols-4 grid-rows-1 divide-x divide-borderColor divide-dashed'>
                <div className='w-full h-full flex' />
                <div className='w-full h-full flex' />
                <div className='w-full h-full flex' />
                <div className='w-full h-full flex' />
            </div>
            <div className='border-t w-6 h-0 border-1 z-10' />
            {title && (
                <h3 className='uppercase text-2xl z-10 font-semibold'>
                    {title.title}
                </h3>
            )}
        </div>
    )
}

export default Header