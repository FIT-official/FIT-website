import Image from "next/image"
import { MdOutlineDiamond, MdOutlinePrecisionManufacturing } from "react-icons/md"
import { CgToolbox } from "react-icons/cg";
import { BsTools } from "react-icons/bs"

function BenefitsSection() {
    return (
        <div className="flex w-full justify-center items-center pb-24 pt-12 border-b px-4 md:px-8 border-borderColor">
            <div className="overflow-hidden rounded-2xl drop-shadow-xl w-full max-w-[650px] relative">
                <Image
                    src="/image.png"
                    alt="About Us"
                    fill
                    className="rounded-lg object-cover opacity-20  z-0"
                    priority
                />
                <div className="relative grid z-10 grid-cols-2 grid-rows-2 text-sm">
                    <div className="flex flex-col gap-2 p-8 border-r border-b border-borderColor">
                        <MdOutlinePrecisionManufacturing size={24} />
                        <span className="font-semibold">
                            High- Precision
                            Prints
                        </span>
                        <span className="text-xs">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.
                        </span>
                    </div>

                    <div className="flex flex-col gap-2 p-8 border-b border-borderColor">
                        <BsTools size={20} />
                        <span className="font-semibold">
                            Quality & Reliable
                            Repairs
                        </span>
                        <span className="text-xs">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.
                        </span>
                    </div>

                    <div className="flex flex-col gap-2 p-8 border-r border-borderColor">
                        <MdOutlineDiamond size={24} />
                        <span className="font-semibold">
                            Trusted Quality
                            Materials
                        </span>
                        <span className="text-xs">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.
                        </span>
                    </div>

                    <div className="flex flex-col gap-2 p-8">
                        <CgToolbox size={24} />
                        <span className="font-semibold">
                            STEM projects,
                            Hackathons
                        </span>
                        <span className="text-xs">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default BenefitsSection