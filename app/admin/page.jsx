'use client'
import { useState } from 'react'
import useAccess from '@/utils/useAccess'
import ContentManagement from '@/components/Admin/DynamicContentManagement'
import CreatorPayments from '@/components/Admin/CreatorPayments'
import CategoryManagement from '@/components/Admin/CategoryManagement'
import DeliveryTypeManagement from '@/components/Admin/DeliveryTypeManagement'
import OrderStatusManagement from '@/components/Admin/OrderStatusManagement'
import { useUser } from '@clerk/nextjs'

export default function AdminPage() {
    const { loading, isAdmin } = useAccess()
    const [activeTab, setActiveTab] = useState('content')
    const { user, isLoaded } = useUser()

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="loader" />
            </div>
        )
    }

    if (!isAdmin) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
                    <p>You don't have permission to access this page.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto py-16 max-w-6xl">
            <div className='flex flex-col px-12 mb-12'>
                <h3>Admin Dashboard</h3>
                <h1 className="flex font-bold mb-6 mt-2">Hello, {user.firstName}.</h1>
                <p className='text-xs w-md'>
                    You can manage your site content, payments and settings here. This includes updating dynamic content, managing creator payments, categories, delivery types, and order statuses.
                </p>
            </div>

            <div className="flex space-x-1 mb-8 border-b border-borderColor overflow-x-auto px-12">
                <button
                    onClick={() => setActiveTab('content')}
                    className={`px-4 cursor-pointer py-2 font-medium text-xs rounded-t-lg whitespace-nowrap ${activeTab === 'content'
                        ? 'bg-black text-white'
                        : 'text-gray-600 hover:text-gray-800 border-t border-r border-l border-borderColor'
                        }`}
                >
                    Content Management
                </button>
                <button
                    onClick={() => setActiveTab('payments')}
                    className={`px-4 cursor-pointer py-2 font-medium text-xs rounded-t-lg whitespace-nowrap ${activeTab === 'payments'
                        ? 'bg-black text-white'
                        : 'text-gray-600 hover:text-gray-800 border-t border-r border-l  border-borderColor'
                        }`}
                >
                    Creator Payments
                </button>
                <button
                    onClick={() => setActiveTab('categories')}
                    className={`px-4 cursor-pointer py-2 font-medium text-xs rounded-t-lg whitespace-nowrap ${activeTab === 'categories'
                        ? 'bg-black text-white'
                        : 'text-gray-600 hover:text-gray-800 border-t border-r border-l  border-borderColor'
                        }`}
                >
                    Categories
                </button>
                <button
                    onClick={() => setActiveTab('delivery')}
                    className={`px-4 cursor-pointer py-2 font-medium text-xs rounded-t-lg whitespace-nowrap ${activeTab === 'delivery'
                        ? 'bg-black text-white'
                        : 'text-gray-600 hover:text-gray-800 border-t border-r border-l  border-borderColor'
                        }`}
                >
                    Delivery Types
                </button>
                <button
                    onClick={() => setActiveTab('orders')}
                    className={`px-4 cursor-pointer py-2 font-medium text-xs rounded-t-lg whitespace-nowrap ${activeTab === 'orders'
                        ? 'bg-black text-white'
                        : 'text-gray-600 hover:text-gray-800 border-t border-r border-l  border-borderColor'
                        }`}
                >
                    Order Statuses
                </button>
            </div>

            {/* Content Management Tab */}
            {activeTab === 'content' && <ContentManagement />}

            {/* Creator Payments Tab */}
            {activeTab === 'payments' && <CreatorPayments />}

            {/* Categories Management Tab */}
            {activeTab === 'categories' && <CategoryManagement />}

            {/* Delivery Types Management Tab */}
            {activeTab === 'delivery' && <DeliveryTypeManagement />}

            {/* Order Statuses Management Tab */}
            {activeTab === 'orders' && <OrderStatusManagement />}
        </div>
    )
}
