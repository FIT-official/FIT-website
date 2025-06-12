// import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

// const geistSans = Geist({
//   variable: "--font-geist-sans",
//   subsets: ["latin"],
// });

// const geistMono = Geist_Mono({
//   variable: "--font-geist-mono",
//   subsets: ["latin"],
// });

export const metadata = {
  title: "FIT",
  description: "3D Services Platform",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        {/* <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      > */}
        <body>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
