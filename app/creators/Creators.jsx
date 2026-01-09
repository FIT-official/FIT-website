"use client"

import Link from "next/link";
import { useStripePriceIds } from "@/utils/StripePriceIdsContext";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { IoMdLock } from "react-icons/io";
import { HiSparkles } from "react-icons/hi";

function Creators() {
  const { stripePriceIds, loading } = useStripePriceIds();

  const tiers = {
    free: '',
    paid: stripePriceIds?.tier2 || stripePriceIds?.tier1 || '',
    team: stripePriceIds?.tier3 || stripePriceIds?.tier4 || '',
  };

  return (
    <div className="min-h-[92vh] flex flex-col items-center border-b border-borderColor justify-center py-16 px-8">
      <div className="flex flex-col items-center justify-center gap-8 w-full max-w-6xl">
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <div className="px-3 py-1 rounded-full border border-borderColor bg-white text-lightColor text-xs font-medium">
            Lorem ipsum
          </div>
          <h1 className="text-center max-w-3xl">
            Lorem ipsum dolor sit amet consectetur
          </h1>
          <p className="text-sm text-lightColor max-w-2xl">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full items-stretch">
          {/* Free */}
          <div className="flex flex-col h-full bg-white border border-borderColor rounded-2xl shadow-sm p-6 gap-5">
            <div className="flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl border border-borderColor flex items-center justify-center">
                <HiSparkles size={18} className="text-textColor" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold text-textColor">Lorem ipsum</div>
                <div className="text-xs text-lightColor">Lorem ipsum dolor sit amet</div>
              </div>
              <div className="text-3xl font-semibold text-textColor">Lorem ipsum</div>
            </div>

            <Link
              href={`/account/subscription${tiers.free ? `?priceId=${encodeURIComponent(tiers.free)}` : ''}`}
              className="formBlackButton w-full justify-center"
            >
              Lorem ipsum
            </Link>

            <div className="flex flex-col gap-3 pt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-lightColor">
                  <IoIosCheckmarkCircleOutline size={14} className="text-textColor mt-0.5" />
                  <span>Lorem ipsum dolor sit amet</span>
                </div>
              ))}
            </div>
          </div>

          {/* Paid (Popular) */}
          <div className="relative flex flex-col h-full bg-white border border-borderColor rounded-2xl shadow-sm p-6 gap-5">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-amber-500 text-textColor text-xs font-medium border border-borderColor">
              Lorem ipsum
            </div>

            <div className="flex flex-col gap-3 pt-1">
              <div className="w-10 h-10 rounded-xl border border-borderColor flex items-center justify-center">
                <IoMdLock size={18} className="text-textColor" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold text-textColor">Lorem ipsum</div>
                <div className="text-xs text-lightColor">Lorem ipsum dolor sit amet</div>
              </div>
              <div className="text-3xl font-semibold text-textColor">Lorem ipsum</div>
            </div>

            <Link
              href={`/account/subscription${tiers.paid ? `?priceId=${encodeURIComponent(tiers.paid)}` : ''}`}
              className="formBlackButton w-full justify-center"
            >
              {loading ? 'Loading…' : 'Lorem ipsum'}
            </Link>

            <div className="flex flex-col gap-3 pt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-lightColor">
                  <IoIosCheckmarkCircleOutline size={14} className="text-textColor mt-0.5" />
                  <span>Lorem ipsum dolor sit amet</span>
                </div>
              ))}
            </div>
          </div>

          {/* Team */}
          <div className="flex flex-col h-full bg-white border border-borderColor rounded-2xl shadow-sm p-6 gap-5">
            <div className="flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl border border-borderColor flex items-center justify-center">
                <IoIosCheckmarkCircleOutline size={18} className="text-textColor" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold text-textColor">Lorem ipsum</div>
                <div className="text-xs text-lightColor">Lorem ipsum dolor sit amet</div>
              </div>
              <div className="text-3xl font-semibold text-textColor">Lorem ipsum</div>
            </div>

            <Link
              href={`/account/subscription${tiers.team ? `?priceId=${encodeURIComponent(tiers.team)}` : ''}`}
              className="formBlackButton w-full justify-center"
            >
              {loading ? 'Loading…' : 'Lorem ipsum'}
            </Link>

            <div className="flex flex-col gap-3 pt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-lightColor">
                  <IoIosCheckmarkCircleOutline size={14} className="text-textColor mt-0.5" />
                  <span>Lorem ipsum dolor sit amet</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Creators