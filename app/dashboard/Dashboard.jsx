'use client'

import Collections from "@/components/DashboardComponents/Collections";
import Visualisation from "@/components/DashboardComponents/Visualisation";
import { useUser } from "@clerk/nextjs"
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import Statistics from "@/components/DashboardComponents/Statistics";
import ActionItems from "@/components/DashboardComponents/ActionItems";
import ExpressWidget from "@/components/DashboardComponents/ExpressWidget";
import Link from "next/link";
import { GoChevronRight } from "react-icons/go";
import useAccess from "@/utils/useAccess";

dayjs.extend(relativeTime);

function Dashboard() {
    const { user, isLoaded } = useUser()
    const [myProducts, setMyProducts] = useState([]);
    const { isAdmin } = useAccess();

    useEffect(() => {
        if (!user || !isLoaded) return;
        const fetchProducts = async () => {
            const res = await fetch(`/api/product?creatorUserId=${user.id}`);
            const data = await res.json();
            setMyProducts(data.products || []);
        };
        fetchProducts();
    }, [user, isLoaded]);


    if (!isLoaded) {
        return <div className="flex min-h-[92vh] flex-col w-full items-center justify-center border-b border-borderColor">
            <div className="loader" />
        </div>
    }

    return (
        <div className="flex flex-col min-h-[92vh] w-full items-stretch justify-start border-b border-borderColor pt-12">
            <div className="flex flex-col items-start justify-end w-full mb-8 gap-2 px-12">
                <h3>Dashboard</h3>
                <h1 className="mb-2">Welcome{user.firstName ? ", " + user.firstName : ""}.</h1>
                <p className="">
                    Here you can manage your products, view statistics, and more.
                </p>
            </div>
            <div className="flex w-full flex-row items-stretch min-w-0">
                <div className="flex self-stretch bg-background border-r border-t border-borderColor flex-col p-4 basis-48 shrink-0 gap-3">
                    {isAdmin && (
                        <Link
                            href="/admin"
                            className="flex flex-col items-start justify-center rounded-md bg-gradient-to-br from-amber-300 to-red-400 px-3 py-3 text-xs font-medium text-white shadow-lg transition hover:scale-[1.02]"
                        >
                            <span className="text-[10px] uppercase tracking-wide opacity-80">Admin</span>
                            <span className="mt-1 text-sm">Open admin dashboard</span>
                            <div className="mt-3 flex w-full items-center justify-end">
                                <GoChevronRight size={14} />
                            </div>
                        </Link>
                    )}

                    <Link
                        href="/dashboard/products"
                        className="flex items-center justify-between rounded-md border border-borderColor px-3 py-2 text-xs font-medium hover:bg-borderColor/20"
                    >
                        <span>My products</span>
                        <GoChevronRight size={14} />
                    </Link>

                    <Link
                        href="/account"
                        className="flex items-center justify-between rounded-md border border-borderColor px-3 py-2 text-xs font-medium hover:bg-borderColor/20"
                    >
                        <span>Account settings</span>
                        <GoChevronRight size={14} />
                    </Link>
                </div>

                <div className="grid grid-cols-4 lg:grid-rows-2 gap-4 h-fit bg-borderColor/40 border-t border-borderColor justify-center py-6 px-8 flex-1 min-w-0">
                    <Visualisation myProducts={myProducts} />
                    <Collections />
                    <Statistics user={user} myProducts={myProducts} />
                    <ActionItems user={user} myProducts={myProducts} />
                    <ExpressWidget user={user} isLoaded={isLoaded} />
                </div>
            </div>
        </div >
    )
}

export default Dashboard