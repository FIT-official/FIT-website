import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import Navbar from "@/components/General/Navbar";
import Footer from "@/components/General/Footer";
import Smooth from "@/components/General/Smooth";
import { ToastProvider } from "@/components/General/ToastProvider";
import { Suspense } from "react";
import { CurrencyProvider } from "@/components/General/CurrencyContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata = {
  title: "Fix It Today® | Home",
  description: "We are a Singapore-based technology solutions provider specializing in additive manufacturing and hardware integration. We offer a comprehensive suite of services including 3D printing, printer maintenance, filament supply, and electronics sourcing.",
  openGraph: {
    title: "Fix It Today® | Home",
    description:
      "We are a Singapore-based technology solutions provider specializing in additive manufacturing and hardware integration.",
    url: "https://fixitoday.com",
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
        <body className={`${inter.variable} antialiased`}>
          <CurrencyProvider>
            <Smooth>
              <Suspense>
                <ToastProvider>
                  <div className="flex flex-row items-center justify-center bg-baseColor">
                    <div className="flex flex-col md:w-[90vw] lg:w-[85vw] max-w-[1350px] w-screen border-l border-r border-borderColor transition-all duration-300 ease-in-out overflow-hidden bg-background">
                      <Navbar />
                      <div className='lg:hidden flex h-16 w-full bg-background' />
                      {children}
                      <Footer />
                    </div>
                  </div>
                </ToastProvider>
              </Suspense>
            </Smooth>
          </CurrencyProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
