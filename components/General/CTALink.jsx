import Link from "next/link"
import { GoChevronRight } from "react-icons/go"

function CTALink({ tag = "", text = "", url = "/" }) {
    return (
        <Link href={url} className="group flex items-center gap-4 p-1 rounded-full border border-borderColor text-xs hover:border-borderColor/50 transition duration-300 ease-out mb-2">
            <div className="justify-between flex gap-4 items-center mask-flare-loop">
                <span className="py-1 px-2 font-normal rounded-full bg-borderColor transition-colors ease-in-out duration-200" >
                    {tag}
                </span>
                <span className="font-medium text-sm">
                    {text}
                </span>
            </div>
            <div className="p-1 text-sm rounded-full bg-borderColor">
                <GoChevronRight />
            </div>
        </Link>
    )
}

export default CTALink