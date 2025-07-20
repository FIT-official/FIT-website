import React from 'react'
import { BiStats } from "react-icons/bi";
import { GoDownload, GoHeart, GoStar } from "react-icons/go";
import dayjs from "dayjs";

function Statistics({ user, myProducts }) {
    return (
        <div className="dashboardSection">
            <div className="flex items-center font-semibold py-3 px-4">
                <BiStats className="mr-2" />
                Statistics
            </div>
            <div className='flex flex-col gap-1 text-xs font-normal p-4'>
                <div className="flex mb-2 font-medium">
                    You joined {user.createdAt ? dayjs(user.createdAt).fromNow() : "some time ago"}.
                </div>
                <div className="flex items-center gap-2">
                    <GoHeart />
                    <span>Likes:</span>
                    <span>
                        {myProducts.reduce((acc, product) => acc + (product.likes || 0), 0)}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <GoStar />
                    <span>Rating:</span>
                    <span>
                        {myProducts.length > 0
                            ? (myProducts.reduce((acc, product) => acc + (product.rating || 0), 0) / myProducts.length).toFixed(1)
                            : "No ratings yet."}
                    </span>
                </div>
                <div className="flex items-center mb-2 gap-2">
                    <GoDownload />
                    <span>Downloads:</span>
                    <span>
                        {myProducts.reduce((acc, product) => acc + (product.downloads || 0), 0)}
                    </span>
                </div>
            </div>
        </div>
    )
}

export default Statistics