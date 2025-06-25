import React from 'react'
import { BiStats } from "react-icons/bi";
import { GoDownload, GoHeartFill, GoStarFill } from "react-icons/go";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

function Statistics({ user, myProducts }) {
    return (
        <div className="col-span-4 lg:col-span-1 row-span-1 px-6 py-2 flex flex-col">
            <div className="flex items-center font-medium text-lg">
                <BiStats className="mr-2" />
                Statistics
            </div>
            <div className="flex border-t border-borderColor w-full h-0 my-2" />
            <div className="flex mb-4">
                You joined {user.createdAt ? dayjs(user.createdAt).fromNow() : "some time ago"}.
            </div>
            <div className="flex items-center mb-2">
                <GoHeartFill className="mr-2 " />
                <span className="font-semibold mr-2">Likes:</span>
                <span>
                    {myProducts.reduce((acc, product) => acc + (product.likes || 0), 0)}
                </span>
            </div>
            <div className="flex items-center mb-2">
                <GoStarFill className="mr-2 " />
                <span className="font-semibold mr-2">Rating:</span>
                <span>
                    {myProducts.length > 0
                        ? (myProducts.reduce((acc, product) => acc + (product.rating || 0), 0) / myProducts.length).toFixed(1)
                        : "No ratings yet."}
                </span>
            </div>
            <div className="flex items-center mb-2">
                <GoDownload className="mr-2 " />
                <span className="font-semibold mr-2">Downloads:</span>
                <span>
                    {myProducts.reduce((acc, product) => acc + (product.downloads || 0), 0)}
                </span>
            </div>
        </div>
    )
}

export default Statistics