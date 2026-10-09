import { headers } from 'next/headers';
import { dashboardEnabled, fixtureMode } from '@/lib/creatorDashboard/flags';
import { jsonLdString } from '@/lib/jsonLd'
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import "./dashboard.css";
import SiteFrame from '@/components/General/SiteFrame';
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
  const surface = dashboardEnabled() ? (await headers()).get('x-fit-creator-surface') : null;
  // Private links and dashboard paths never enter analytics. Local fixtures use
  // the same frame with a dev-only signed-out Clerk shim and no service clients.
  if (surface === 'tracking' || surface === 'dashboard' || fixtureMode()) return (
    <ClerkProvider><html lang="en"><body className={`${inter.variable} antialiased`}>
      <ToastProvider><ClientProviders><SiteFrame>{children}</SiteFrame></ClientProviders></ToastProvider>
    </body></html></ClerkProvider>
  );
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
                    <SiteFrame>{children}</SiteFrame>
                    <Suspense><ChatLauncher /></Suspense>
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
