import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import Navbar from "@/components/General/Navbar";
import Footer from "@/components/General/Footer";
import Smooth from "@/components/General/Smooth";
import { ToastProvider } from "@/components/General/ToastProvider";
import { Suspense } from "react";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata = {
  title: "FIT",
  description: "3D Services Platform",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${inter.variable} antialiased`}>
          <Smooth>
            <ToastProvider>
              <div className="flex flex-row items-center justify-center bg-baseColor">
                <div className="flex flex-col md:w-[90vw] lg:w-[85vw] max-w-[1350px] w-screen border-l border-r border-borderColor transition-all duration-300 ease-in-out overflow-hidden bg-background">
                  <Suspense>
                    <Navbar />
                  </Suspense>
                  <div className='lg:hidden flex h-16 w-full bg-background' />
                  {children}
                  <Footer />
                </div>
              </div>
            </ToastProvider>
          </Smooth>
        </body>
      </html>
    </ClerkProvider>
  );
}
