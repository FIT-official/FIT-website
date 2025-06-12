'use client'

import Link from "next/link";


export default function Home() {
  return (
    <div className="flex flex-col h-screen w-screen items-center justify-center">
      <div>Landing page</div>
      <Link href='/dashboard'>Go To Dashboard</Link>
    </div>
  );
}
