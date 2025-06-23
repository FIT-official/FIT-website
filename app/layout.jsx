import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Smooth from "@/components/Smooth";

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
            <div className="flex flex-row items-center justify-center">
              <div className="flex flex-col md:w-[90vw] lg:w-[85vw] w-screen border-l border-r border-borderColor transition-all duration-300 ease-in-out overflow-hidden">
                <Navbar />
                {children}
                <Footer />
              </div>
            </div>
          </Smooth>
        </body>
      </html>
    </ClerkProvider>
  );
}
