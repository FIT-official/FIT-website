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
import { SITE_URL } from '@/lib/seo/site';

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
      "logo": "https://www.fixitoday.com/fitogimage.png",
      "description": "We are a Singapore-based technology solutions provider specializing in additive manufacturing and hardware integration. We offer a comprehensive suite of services including 3D printing, printer maintenance, filament supply, and electronics sourcing.",
      "areaServed": "SG"
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
  title: "3D Printer Repair & Filament Singapore | Fix It Today",
  description: "We are a Singapore-based technology solutions provider specializing in additive manufacturing and hardware integration. We offer a comprehensive suite of services including 3D printing, printer maintenance, filament supply, and electronics sourcing.",
  openGraph: {
    title: "Fix It Today® | Home",
    description:
      "We are a Singapore-based technology solutions provider specializing in additive manufacturing and hardware integration.",
    url: "https://www.fixitoday.com",
    siteName: "Fix It Today®",
    images: [
      {
        url: "/fitogimage.png",
        width: 800,
        height: 800,
        alt: "Fix It Today® Photo",
      },
    ],
    locale: "en_SG",
    type: "website",
  },
};

export default function RootLayout({ children }) {
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
          <CurrencyProvider>
            <Smooth>
                <ToastProvider>
                  <PostHogProvider>
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
                  </PostHogProvider>
                </ToastProvider>
            </Smooth>
          </CurrencyProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
