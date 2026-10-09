import { Suspense } from 'react';
import MaintenanceBanner from '@/components/MaintenanceBanner';
import Navbar from './Navbar';
import Footer from './Footer';

// Shared storefront frame; async route children stay outside Suspense so real
// notFound responses can set HTTP 404 before any shell fallback is flushed.
export default function SiteFrame({ children }) {
    return <div className="flex flex-row items-center justify-center bg-baseColor">
        <div data-fit-page-frame className="flex flex-col md:w-[90vw] lg:w-[85vw] max-w-[1350px] w-screen border-l border-r border-borderColor transition-all duration-300 ease-in-out overflow-hidden bg-background">
            <MaintenanceBanner />
            <Suspense fallback={<div className="h-14" />}><Navbar /></Suspense>
            <div className="lg:hidden flex h-14 w-full bg-background" />
            {children}
            <Footer />
        </div>
    </div>;
}
