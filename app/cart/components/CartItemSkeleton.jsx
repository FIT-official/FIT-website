const CartItemSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-rows-1 md:grid-cols-5 gap-2 md:gap-4 py-8 md:py-4 animate-pulse">
        <div className="flex w-full h-full items-center justify-start">
            <div className="w-16 h-16 bg-borderColor aspect-square" />
        </div>
        <div className="flex flex-col gap-2 w-full">
            <div className="h-4 w-2/3 bg-borderColor mb-2" />
            <div className="h-3 w-1/3 bg-borderColor" />
        </div>
        <div className="flex items-center md:justify-center">
            <div className="w-20 h-6 bg-borderColor" />
        </div>
        <div className="flex items-center md:justify-center">
            <div className="w-24 h-8 bg-borderColor" />
        </div>
        <div className="flex flex-col justify-center items-end">
            <div className="h-5 w-16 bg-borderColor mb-1" />
            <div className="h-3 w-10 bg-borderColor" />
        </div>
    </div>
);

export default CartItemSkeleton