'use client'
import React, { useEffect, useState } from 'react'
import { useUser, useSession } from "@clerk/nextjs"
import ContactSection from '@/components/Account/ContactSection';
import OrderSection from '@/components/Account/OrderSection';
import ProfileSettings from '@/components/Account/ProfileSettings';
import SecuritySettings from '@/components/Account/SecuritySettings';
import { PiDotsThree } from 'react-icons/pi';
import DownloadsSection from '@/components/Account/DownloadsSection';

function Account() {
    const { user, isLoaded } = useUser();
    const { session: currentSession } = useSession();

    const [tab, setTab] = useState("profile");
    const [connectedAccounts, setConnectedAccounts] = useState([]);
    const [devices, setDevices] = useState([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        if (!isLoaded || !user) return;
        setConnectedAccounts(user.externalAccounts || []);
        (async () => {
            if (typeof user.getSessions === "function") {
                try {
                    const sessions = await user.getSessions();
                    setDevices(sessions || []);
                } catch (err) {
                    setDevices([]);
                }
            } else {
                setDevices(user.sessions || []);
            }
        })();
    }, [isLoaded, user]);

    const onSidebarToggle = () => {
        setSidebarOpen((prev) => !prev);
    };

    return (
        <div className="flex flex-col w-full h-screen md:h-[92vh] border-b border-borderColor py-12 px-8 md:px-12 items-center justify-center">
            <div className='flex flex-col w-full bg-baseColor h-full rounded-lg'>
                <h3>Profile</h3>
                <h1>Account Settings</h1>
                <div className='flex relative h-full w-full bg-background mt-6 rounded-lg divide-x divide-borderColor drop-shadow-sm overflow-x-hidden'>
                    <div
                        className={`absolute bg-background flex flex-col z-10 sidebar ${sidebarOpen ? 'translate-x-0' : '-translate-x-[82%]'}`}
                    >
                        <div className='flex flex-row items-center justify-end w-full'>
                            <PiDotsThree size={20} onClick={onSidebarToggle} className='flex hover:cursor-pointer mb-5 mt-4' />
                        </div>
                        <button
                            onClick={() => setTab("profile")}
                            className={`flex px-2 py-1 sidebarButton ${tab === "profile" ? "bg-borderColor/40" : "bg-transparent"}`}
                            disabled={!sidebarOpen}
                        >
                            Profile
                        </button>
                        <button
                            onClick={() => setTab("security")}
                            className={`flex px-2 py-1 sidebarButton ${tab === "security" ? "bg-borderColor/40" : "bg-transparent"}`}
                            disabled={!sidebarOpen}
                        >
                            Security
                        </button>
                        <button
                            onClick={() => setTab("orders")}
                            className={`flex px-2 py-1 sidebarButton ${tab === "orders" ? "bg-borderColor/40" : "bg-transparent"}`}
                            disabled={!sidebarOpen}
                        >
                            Orders
                        </button>
                        <button
                            onClick={() => setTab("billing")}
                            className={`flex px-2 py-1 sidebarButton ${tab === "billing" ? "bg-borderColor/40" : "bg-transparent"}`}
                            disabled={!sidebarOpen}
                        >
                            Billing
                        </button>
                        <button
                            onClick={() => setTab("downloads")}
                            className={`flex px-2 py-1 sidebarButton ${tab === "downloads" ? "bg-borderColor/40" : "bg-transparent"}`}
                            disabled={!sidebarOpen}
                        >
                            Downloads
                        </button>
                    </div>
                    <div className='flex flex-col pl-16 pr-4 py-8 w-full'>
                        {tab === "profile" && (
                            <ProfileSettings
                                connectedAccounts={connectedAccounts}
                                user={user}
                                isLoaded={isLoaded}
                            />
                        )}
                        {tab === "security" && (
                            <SecuritySettings
                                devices={devices}
                                currentSession={currentSession}
                            />
                        )}
                        {tab === "billing" && (
                            <ContactSection />
                        )}
                        {tab === "orders" && (
                            <OrderSection />
                        )}
                        {tab === "downloads" && (
                            <DownloadsSection user={user} isLoaded={isLoaded} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Account