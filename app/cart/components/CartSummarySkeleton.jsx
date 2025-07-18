const CartSummarySkeleton = () => (
    <div className="flex flex-col divide-y divide-borderColor text-xs animate-pulse">
        {[...Array(2)].map((_, idx) => (
            <div key={idx} className="flex justify-between gap-20 py-2">
                <div className="h-3 w-32 bg-borderColor" />
                <div className="h-3 w-12 bg-borderColor " />
            </div>
        ))}
        <div className="py-2 flex justify-between font-bold mt-2 w-full whitespace-nowrap">
            <div className="h-4 w-20 bg-borderColor" />
            <div className="h-4 w-16 bg-borderColor" />
        </div>
    </div>
);

export default CartSummarySkeleton