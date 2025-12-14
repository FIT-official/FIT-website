import CTALink from "@/components/General/CTALink"
import { IoIosCheckmarkCircleOutline } from "react-icons/io"

function Creators() {
  return (
    <div className="min-h-[92vh] flex flex-col items-center p-12 border-b border-borderColor justify-center">
          <div className="pt-4 md:pt-12 flex flex-col items-center justify-center gap-6 px-8 md:px-12">
            <CTALink tag="New" text="Subscribe Now" url="/account/subscription" />
            <h1 className="flex text-center max-w-lg">
                Join dozens of small businesses at Fix It Today®
            </h1>
            <div className="flex flex-row items-center gap-6 text-lightColor text-xs font-normal">
            <div className="flex items-center gap-2">
            <IoIosCheckmarkCircleOutline size={16} />
            7-day free trial
            </div>
            <div className="flex items-center gap-2">
            <IoIosCheckmarkCircleOutline size={16} />
            Cancel anytime
            </div>
            <div className="flex items-center gap-2">
            <IoIosCheckmarkCircleOutline size={16} />
            Secure payment
            </div>
            </div>
        </div>
        </div>
  )
}

export default Creators