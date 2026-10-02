import { jsonLdString } from '@/lib/jsonLd'
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import "./dashboard.css";
import Navbar from "@/components/General/Navbar";
import Footer from "@/components/General/Footer";
import Smooth from "@/components/General/Smooth";
import { ToastProvider } from "@/components/General/ToastProvider";
import ChatLauncher from "@/components/Chat/ChatLauncher";
import { Suspense } from "react";
import { CurrencyProvider } from "@/components/General/CurrencyContext";
import ClientProviders from "@/components/General/ClientProviders";
import PostHogProvider from "@/components/General/PostHogProvider";
import AnalyticsConsentProvider from "@/components/General/AnalyticsConsentProvider";
import GoogleMeasurementProvider from "@/components/General/GoogleMeasurementProvider";
import { SITE_URL, absoluteUrl } from '@/lib/seo/site';
import { siteJsonLd } from '@/lib/seo/organization';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Fix It Today | 3D Printing & Custom Parts Singapore',
  description: '3D printing, custom metal parts, CAD design, electronics, printer repair and STEM workshops in Singapore.',
  openGraph: { siteName: 'Fix It Today', locale: 'en_SG', type: 'website', images: [absoluteUrl('/fitogimage.png')] },
  twitter: { card: 'summary_large_image', images: [absoluteUrl('/fitogimage.png')] },
  robots: { index: true, follow: true, googleBot: { 'max-image-preview': 'large' } },
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <script
            type="application/ld+json"
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: jsonLdString(siteJsonLd) }}
          />
        </head>
        <body className={`${inter.variable} antialiased`}>
          <CurrencyProvider>
            <Smooth>
                <ToastProvider>
                  <AnalyticsConsentProvider><GoogleMeasurementProvider><PostHogProvider>
                  <ClientProviders>
                    <div className="flex flex-row items-center justify-center bg-baseColor">
                      <div className="flex flex-col md:w-[90vw] lg:w-[85vw] max-w-[1350px] w-screen border-l border-r border-borderColor transition-all duration-300 ease-in-out overflow-hidden bg-background">
                        <Suspense fallback={<div className="h-14" />}><Navbar /></Suspense>
                        <div className='lg:hidden flex h-14 w-full bg-background' />
                        <Suspense>{children}</Suspense>
                        <Footer />
                      </div>
                      <Suspense><ChatLauncher /></Suspense>
                    </div>
                  </ClientProviders>
                  </PostHogProvider></GoogleMeasurementProvider></AnalyticsConsentProvider>
                </ToastProvider>
            </Smooth>
          </CurrencyProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
