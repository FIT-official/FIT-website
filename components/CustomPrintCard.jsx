'use client'
import Link from "next/link";
import Image from "next/image";
import { HiCube, HiUpload } from "react-icons/hi";
import { GoChevronRight } from "react-icons/go";

// Entry tile for the print request page. It stands on its own (no price, no
// account, no custom-print product needed); a product image is optional.
function CustomPrintCard({ product = null }) {
    const image = product?.images?.[0];
    return (
        <Link
            href="/prints/request"
            className="group relative flex flex-col gap-3 rounded-lg border border-dashed border-borderColor bg-linear-to-br from-baseColor to-background p-4 transition-all duration-300 hover:border-textColor/20 hover:shadow-lg"
        >
            {image ? (
                <Image
                    src={`/api/proxy?key=${encodeURIComponent(image)}`}
                    alt="Custom 3D printing"
                    width={400}
                    height={400}
                    className="mb-2 flex aspect-square w-full rounded-lg bg-borderColor/30 object-cover transition-colors group-hover:bg-borderColor/50"
                />
            ) : (
                <div className="mb-2 flex aspect-square w-full flex-col items-center justify-center gap-4 rounded-lg bg-borderColor/30 transition-colors group-hover:bg-borderColor/50">
                    <div className="relative">
                        <HiCube className="text-6xl text-lightColor transition-colors group-hover:text-textColor" aria-hidden="true" />
                        <HiUpload className="absolute -bottom-2 -right-2 rounded-full border-2 border-borderColor bg-background p-1 text-2xl text-textColor" aria-hidden="true" />
                    </div>
                    <p className="text-xs text-lightColor">STL, OBJ or 3MF · price as you go</p>
                </div>
            )}
            <div className="flex w-full flex-col items-center text-center">
                <p className="text-sm font-semibold">Get a 3D print made</p>
                <p className="mt-1 text-xs text-lightColor">Upload a model, pick material and colour, see the price.</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-4">Start a request <GoChevronRight aria-hidden="true" /></span>
            </div>
        </Link>
    )
}

export default CustomPrintCard
