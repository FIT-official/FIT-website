import { jsonLdString } from '@/lib/jsonLd'
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import "./dashboard.css";
import Navbar from "@/components/General/Navbar";
import MaintenanceBanner from '@/components/MaintenanceBanner';
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
import PresentationBoundary from '@/components/Workshop/PresentationBoundary';
import { SITE_URL, absoluteUrl } from '@/lib/seo/site';
import { headers } from 'next/headers';
import { DRAFT_SHELL_HEADER } from '@/lib/blog/draftAccess';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const GEO_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.fixitoday.com/#organization",
      "name": "Fix It Today®",
      "url": "https://www.fixitoday.com",
      "logo": "https://www.fixitoday.com/fitogimage.jpg",
      "description": "3D printing, custom metal parts, CAD design, electronics, printer repair and STEM workshops in Singapore.",
      "email": "fixittoday.contact@gmail.com",
      "sameAs": ["https://www.linkedin.com/company/fix-it-today-sg"],
      "areaServed": { "@type": "Country", "name": "Singapore" }
    },
    {
      "@type": "WebSite",
      "@id": "https://www.fixitoday.com/#website",
      "url": "https://www.fixitoday.com",
      "name": "Fix It Today®",
      "publisher": {
        "@id": "https://www.fixitoday.com/#organization"
      },
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://www.fixitoday.com/shop?search={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    }
  ]
};

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Fix It Today | 3D Printing & Custom Parts Singapore',
  description: '3D printing, custom metal parts, CAD design, electronics, printer repair and STEM workshops in Singapore.',
  openGraph: { siteName: 'Fix It Today', locale: 'en_SG', type: 'website', images: [absoluteUrl('/fitogimage.jpg')] },
  twitter: { card: 'summary_large_image', images: [absoluteUrl('/fitogimage.jpg')] },
  robots: { index: true, follow: true, googleBot: { 'max-image-preview': 'large' } },
};

export default async function RootLayout({ children }) {
  // Middleware owns this marker. Drafts must not mount Clerk, analytics, chat,
  // maintenance or the public navigation's database-backed API consumers.
  if ((await headers()).get(DRAFT_SHELL_HEADER) === '1') {
    return <html lang="en"><body className="antialiased">{children}</body></html>;
  }
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <script
            type="application/ld+json"
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: jsonLdString(GEO_JSON_LD) }}
          />
        </head>
        <body className={`${inter.variable} antialiased`}>
          <PresentationBoundary presentation={children}>
          <CurrencyProvider>
            <Smooth>
                <ToastProvider>
                  <AnalyticsConsentProvider><GoogleMeasurementProvider><PostHogProvider>
                  <ClientProviders>
                    <div className="flex flex-row items-center justify-center bg-baseColor">
                      <div data-fit-page-frame className="flex flex-col md:w-[90vw] lg:w-[85vw] max-w-[1350px] w-screen border-l border-r border-borderColor transition-all duration-300 ease-in-out overflow-hidden bg-background">
                        <MaintenanceBanner />
                        <Suspense fallback={<div className="h-14" />}><Navbar /></Suspense>
                        <div className='lg:hidden flex h-14 w-full bg-background' />
                        {/* Keep route existence checks in the shell: a fallback here
                            commits HTTP 200 before an async page can call notFound(). */}
                        {children}
                        <Footer />
                      </div>
                      <Suspense><ChatLauncher /></Suspense>
                    </div>
                  </ClientProviders>
                  </PostHogProvider></GoogleMeasurementProvider></AnalyticsConsentProvider>
                </ToastProvider>
            </Smooth>
          </CurrencyProvider>
          </PresentationBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
