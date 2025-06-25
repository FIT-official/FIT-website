function Grid() {
    return (
        <div className='absolute w-full h-full left-0 top-0 z-0 grid grid-cols-4 grid-rows-1 divide-x divide-borderColor divide-dashed pointer-events-none'>
            <div className='w-full h-full flex' />
            <div className='w-full h-full flex' />
            <div className='w-full h-full flex' />
            <div className='w-full h-full flex' />
        </div>
    )
}

export default Grid