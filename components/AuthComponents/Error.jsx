import React from 'react'
import { RxCross2 } from 'react-icons/rx';

function Error({ error, setError }) {

    const cancelError = () => {
        setError('');
    };

    if (!error) return null;
    return (
        <div className='flex flex-row items-center justify-between px-4 py-2 rounded-md text-red-800 border-red-800 bg-red-200 text-xs uppercase w-full font-medium'>
            <div className='w-full truncate overflow-hidden'>
                {error}
            </div>
            <RxCross2 size={14} onClick={cancelError} className='cursor-pointer flex' />
        </div>
    )
}

export default Error