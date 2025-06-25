import React from 'react'
import Grid from './Grid'

function Header(title) {
    return (
        <div className='flex flex-col gap-2 w-full h-48 md:h-64 transition-all duration-300 ease-in-out items-center justify-center relative border-b border-borderColor'>
            <Grid />
            <div className='border-t w-6 h-0 border-1 z-10' />
            {title && (
                <p className='uppercase text-lg md:text-2xl z-10 font-semibold'>
                    {title.title}
                </p>
            )}
        </div>
    )
}

export default Header