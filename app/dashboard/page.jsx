'use client'

import Collections from "@/components/DashboardComponents/Collections";
import Visualisation from "@/components/DashboardComponents/Visualisation";
import { useUser } from "@clerk/nextjs"
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import Statistics from "@/components/DashboardComponents/Statistics";
import ActionItems from "@/components/DashboardComponents/ActionItems";

dayjs.extend(relativeTime);

function Dashboard() {
    const { user, isLoaded } = useUser()
    const [myProducts, setMyProducts] = useState([]);


    useEffect(() => {
        if (!user) return;
        const fetchProducts = async () => {
            const res = await fetch(`/api/product/${user.id}`);
            const data = await res.json();
            setMyProducts(data.products || []);
        };
        fetchProducts();
    }, [user]);


    if (!isLoaded) {
        return <div>Loading...</div>
    }

    return (
        <div className="flex flex-col w-full items-center justify-center border-b border-borderColor">
            <div className="flex h-[15vh] flex-col items-start justify-end w-full  gap-2 px-12">
                <h3>Dashboard</h3>
                <h1 className="mb-4 md:text-6xl">Welcome, {user.firstName || user.emailAddresses[0].emailAddress}</h1>
            </div>
            <div className="flex w-full border-t border-borderColor mt-8" />
            <div className="flex w-full items-center justify-center p-12">
                <div className="grid w-full grid-cols-4 lg:grid-rows-2 gap-4">
                    <Visualisation myProducts={myProducts} />
                    <Collections />
                    <Statistics user={user} myProducts={myProducts} />
                    <ActionItems myProducts={myProducts} />
                </div>

            </div>
        </div >
    )
}

export default Dashboard