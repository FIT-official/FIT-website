"use client"

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUserSubscription } from "@/utils/UserSubscriptionContext";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { HiSparkles } from "react-icons/hi";
import { IoStorefrontOutline, IoRocketOutline, IoPeopleOutline, IoBusinessOutline } from "react-icons/io5";

// Paid-tier icons in tier order (tier1..tier4).
const TIER_ICONS = [IoStorefrontOutline, IoRocketOutline, IoPeopleOutline, IoBusinessOutline];

// Honest fallbacks when a Stripe product carries no marketing features —
// these mirror the real entitlements (utils/entitlements.js: any paid tier
// unlocks the creator dashboard and messaging).
const FREE_FEATURES = [
    "Browse and buy from the full catalogue",
    "Request custom 3D prints with instant quotes",
    "Track orders, downloads and print requests",
    "Leave reviews and follow creators",
];
const PAID_FALLBACK_FEATURES = [
    "Creator dashboard with sales and orders",
    "Sell physical prints and digital files",
    "Direct messaging with your customers",
    "Payouts through Stripe",
];

// Tailwind needs literal class names; pick the xl column count by card total.
const XL_COLS = {
    1: "xl:grid-cols-1",
    2: "xl:grid-cols-2",
    3: "xl:grid-cols-3",
    4: "xl:grid-cols-4",
    5: "xl:grid-cols-5",
};

function priceLabel(plan) {
    if (plan.amount === null) return plan.name;
    const money = new Intl.NumberFormat("en-SG", {
        style: "currency",
        currency: plan.currency || "SGD",
        minimumFractionDigits: plan.amount % 1 === 0 ? 0 : 2,
    }).format(plan.amount);
    return money;
}

// Card variants echo the admin dashboard's stat tiles: `ink` (flat black) for
// the highest tier, `sun` (flat yellow) for the runner-up, paper otherwise.
const VARIANTS = {
    paper: {
        card: "bg-white border-borderColor",
        name: "text-textColor",
        desc: "text-lightColor",
        price: "text-textColor",
        per: "text-lightColor",
        chip: "border-borderColor",
        icon: "text-textColor",
        feature: "text-lightColor",
        check: "text-textColor",
        button: "formBlackButton",
        currentButton: "border border-textColor text-textColor",
    },
    sun: {
        card: "bg-amber-300 border-amber-300",
        name: "text-textColor",
        desc: "text-textColor/70",
        price: "text-textColor",
        per: "text-textColor/70",
        chip: "border-textColor/20",
        icon: "text-textColor",
        feature: "text-textColor/80",
        check: "text-textColor",
        button: "formBlackButton",
        currentButton: "border border-textColor text-textColor",
    },
    ink: {
        card: "bg-textColor border-textColor",
        name: "text-white",
        desc: "text-white/60",
        price: "text-white",
        per: "text-white/60",
        chip: "border-white/25",
        icon: "text-white",
        feature: "text-white/75",
        check: "text-white",
        button: "formBlackButton !bg-white !text-textColor hover:!bg-white/90",
        currentButton: "border border-white/60 text-white",
    },
};

function PlanCard({ icon: Icon, name, description, price, per, features, href, current, popular, loading, variant = "paper" }) {
    const v = VARIANTS[variant] || VARIANTS.paper;
    return (
        <div className={`relative flex flex-col h-full border rounded-2xl shadow-sm p-6 gap-5 ${v.card}`}>
            {popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white text-textColor text-xs font-medium border border-borderColor whitespace-nowrap">
                    Most popular
                </div>
            )}
            <div className="flex flex-col gap-3 pt-1">
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${v.chip}`}>
                    <Icon size={18} className={v.icon} />
                </div>
                <div className="flex flex-col gap-1">
                    <div className={`text-sm font-semibold ${v.name}`}>{name}</div>
                    <div className={`text-xs min-h-[2rem] ${v.desc}`}>{description}</div>
                </div>
                <div className="flex items-baseline gap-1">
                    <span className={`text-3xl font-semibold ${v.price}`}>{price}</span>
                    {per && <span className={`text-xs ${v.per}`}>/{per}</span>}
                </div>
            </div>

            {current ? (
                <div className={`flex px-3 py-2 items-center justify-center rounded-md font-medium text-sm ${v.currentButton}`}>
                    Current plan
                </div>
            ) : (
                <Link href={href} className={`${v.button} w-full justify-center`}>
                    {loading ? "Loading…" : "Choose plan"}
                </Link>
            )}

            <div className="flex flex-col gap-3 pt-2">
                {features.map((feature) => (
                    <div key={feature} className={`flex items-start gap-2 text-xs ${v.feature}`}>
                        <IoIosCheckmarkCircleOutline size={14} className={`mt-0.5 shrink-0 ${v.check}`} />
                        <span>{feature}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SkeletonCard() {
    return (
        <div className="flex flex-col h-full bg-white border border-borderColor rounded-2xl shadow-sm p-6 gap-5 animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-baseColor border border-borderColor" />
            <div className="h-4 w-24 bg-baseColor rounded" />
            <div className="h-8 w-28 bg-baseColor rounded" />
            <div className="h-9 w-full bg-baseColor rounded-full" />
            <div className="flex flex-col gap-3 pt-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-3 w-4/5 bg-baseColor rounded" />
                ))}
            </div>
        </div>
    );
}

function Creators() {
    const { subscription } = useUserSubscription();
    const [plans, setPlans] = useState(null); // null = loading, [] = none/error
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/stripe/plans");
                const data = await res.json();
                if (!cancelled) setPlans(res.ok ? data.plans || [] : []);
            } catch {
                if (!cancelled) setPlans([]);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const currentPriceId = subscription?.priceId || "";
    const loading = plans === null;
    const paidPlans = plans || [];
    // "Most popular": Stripe product metadata `popular=true` wins; otherwise
    // the second paid plan (classic anchor position), if there is one.
    const popularPriceId =
        paidPlans.find((p) => p.popular)?.priceId ?? (paidPlans.length > 1 ? paidPlans[1].priceId : null);
    // Salience by price (client directive): the most expensive plan is the flat
    // black card, the second most expensive the flat yellow one.
    const byPriceDesc = [...paidPlans]
        .filter((p) => typeof p.amount === "number")
        .sort((a, b) => b.amount - a.amount);
    const variantFor = (plan) => {
        if (byPriceDesc[0]?.priceId === plan.priceId) return "ink";
        if (byPriceDesc[1]?.priceId === plan.priceId) return "sun";
        return "paper";
    };
    const totalCards = 1 + (loading ? 2 : paidPlans.length);

    return (
        <div className="min-h-[92vh] flex flex-col items-center border-b border-borderColor justify-center py-16 px-8">
            <div className="flex flex-col items-center justify-center gap-8 w-full max-w-6xl">
                <div className="flex flex-col items-center justify-center gap-4 text-center">
                    <div className="px-3 py-1 rounded-full border border-borderColor bg-white text-lightColor text-xs font-medium">
                        Pricing
                    </div>
                    <h1 className="text-center max-w-3xl">
                        Turn your 3D prints into a business
                    </h1>
                    <p className="text-sm text-lightColor max-w-2xl">
                        Shopping is always free. Pick a creator plan to open your own storefront,
                        sell prints and digital files, and message customers directly. Upgrade,
                        downgrade or cancel anytime.
                    </p>
                </div>

                <div className={`grid grid-cols-1 md:grid-cols-2 ${XL_COLS[Math.min(totalCards, 5)]} gap-6 w-full items-stretch`}>
                    <PlanCard
                        icon={HiSparkles}
                        name="Shopper"
                        description="Everything you need to buy and print, free forever."
                        price="Free"
                        features={FREE_FEATURES}
                        href="/account/subscription"
                        current={!currentPriceId}
                    />
                    {loading
                        ? [0, 1].map((i) => <SkeletonCard key={i} />)
                        : paidPlans.map((plan, i) => (
                            <PlanCard
                                key={plan.priceId}
                                icon={TIER_ICONS[i % TIER_ICONS.length]}
                                name={plan.name}
                                description={plan.description || "For creators selling on the platform."}
                                price={priceLabel(plan)}
                                per={plan.interval}
                                features={plan.features.length > 0 ? plan.features : PAID_FALLBACK_FEATURES}
                                href={`/account/subscription?priceId=${encodeURIComponent(plan.priceId)}`}
                                current={currentPriceId === plan.priceId}
                                popular={plan.priceId === popularPriceId}
                                variant={variantFor(plan)}
                            />
                        ))}
                </div>

                {!loading && paidPlans.length === 0 && (
                    <p className="text-xs text-lightColor">
                        Creator plans are unavailable right now. Please check back soon.
                    </p>
                )}
            </div>
        </div>
    );
}

export default Creators
