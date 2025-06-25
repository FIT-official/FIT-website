import { IoMdCheckmark } from 'react-icons/io'
import { IoAlert } from 'react-icons/io5'
import { MdOutlineCancel } from "react-icons/md";

function Indicator({ type }) {
    const indicatorIcons = {
        0: <IoMdCheckmark className="inline mr-1" size={12} />,
        1: <IoAlert className="inline mr-1" size={12} />,
        2: <MdOutlineCancel className="inline mr-1" size={12} />,
    }
    const indicatorStyles = {
        0: "bg-teal-100 border-teal-600 text-teal-800",
        1: "bg-amber-100 border-amber-600 text-amber-800",
        2: "bg-red-100 border-red-600 text-red-800",
    }
    const indicatorText = {
        0: "Successful",
        1: "Pending",
        2: "Cancelled",
    }
    return (
        <div className={`flex items-center border text-xs rounded-md font-medium px-2 py-1 ${indicatorStyles[type]}`}>
            {indicatorIcons[type]}
            <span>{indicatorText[type]}</span>
        </div>
    )
}

export default Indicator