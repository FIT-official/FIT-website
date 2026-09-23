import Link from 'next/link';
import { authenticate, UnauthorizedError } from '@/lib/authenticate';
import { checkAdminPrivileges } from '@/lib/checkPrivileges';
import { getStoreReadiness } from '@/lib/storeReadiness';
import { CREATOR_BILLING_PLANS } from '@/lib/creatorPlans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Store checks', robots: { index: false, follow: false } };

const pricePlans = CREATOR_BILLING_PLANS.filter(plan => plan.id !== 'free');
const priceKey = plan => `${plan.id}${plan.interval === 'year' ? 'Yearly' : ''}`;
const priceIssues = {
    price_not_configured: 'Connect this subscription price before offering this billing option.',
    price_invalid: 'Check the price amount, currency, billing interval and plan mapping in the payment settings.',
    stripe_not_configured: 'Configure the payment provider connection before offering paid plans.',
    price_unavailable: 'The payment provider could not confirm this price. Check the connection and try again.',
};

function CheckCard({ title, ready, deferred = false, children }) {
    const status = ready ? 'Passed' : deferred ? 'Deferred' : 'Needs attention';
    const colour = ready ? 'bg-emerald-50 text-emerald-800' : deferred ? 'bg-baseColor text-lightColor' : 'bg-amber-50 text-amber-900';
    return <article className="rounded-xl border border-borderColor bg-background p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">{title}</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${colour}`}>{status}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-lightColor">{children}</p>
    </article>;
}

function AccessMessage({ title, children, signIn = false }) {
    return <main className="mx-auto max-w-2xl space-y-5 px-6 py-16 text-textColor">
        <h1>{title}</h1><p className="text-lightColor">{children}</p>
        <Link href={signIn ? '/sign-in?redirect_url=%2Fadmin%2Fstore-checks' : '/admin'} className="inline-block text-sm underline">
            {signIn ? 'Sign in' : 'Back to admin'}
        </Link>
    </main>;
}

export default async function StoreChecksPage() {
    try {
        const { userId } = await authenticate();
        if (!await checkAdminPrivileges(userId)) {
            return <AccessMessage title="Access denied">An admin account is needed to view store checks.</AccessMessage>;
        }
    } catch (error) {
        return error instanceof UnauthorizedError
            ? <AccessMessage title="Sign in to view store checks" signIn>Use your admin account to continue.</AccessMessage>
            : <AccessMessage title="Admin access could not be verified">Please try again shortly.</AccessMessage>;
    }

    let checks;
    try { checks = await getStoreReadiness(); } catch {
        return <AccessMessage title="Store checks are unavailable">The checks could not run. Please try again shortly.</AccessMessage>;
    }
    const paymentReady = checks.checkoutTransactions?.ready === true && checks.checkoutWebhook?.ready === true &&
        pricePlans.every(plan => checks.subscriptionPrices?.[priceKey(plan)]?.ready === true);
    const storage = checks.fabricationStorage;
    const storageDeferred = !storage?.ready && storage?.code === 'fabrication_storage_not_configured';

    return <main className="mx-auto max-w-4xl space-y-7 px-4 py-10 text-textColor sm:px-6">
        <header className="space-y-3">
            <Link href="/admin" className="text-sm underline">Back to admin</Link>
            <h1>Store checks</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-lightColor">These checks run without changing store data or starting payments. They verify the current server configuration; they do not place a test order.</p>
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <p className={`text-sm font-medium ${paymentReady ? 'text-emerald-800' : 'text-amber-900'}`}>
                    {paymentReady ? 'Store payment checks passed.' : 'Store payment checks need attention.'}
                </p>
                {/* A full page request reruns the authenticated server probes. */}
                <a href="/admin/store-checks" className="rounded-lg border border-borderColor px-4 py-2 text-sm">Run checks again</a>
            </div>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
            <CheckCard title="Order storage" ready={checks.checkoutTransactions?.ready}>
                {checks.checkoutTransactions?.ready
                    ? 'A database transaction read completed and was aborted without changes.'
                    : 'Checkout is paused because database transaction support could not be verified. Check the database connection and transaction support.'}
            </CheckCard>
            <CheckCard title="Payment confirmation" ready={checks.checkoutWebhook?.ready}>
                {checks.checkoutWebhook?.ready
                    ? 'The payment notification verifier is configured. This checks its presence, not delivery of a payment notification.'
                    : 'Checkout is paused until the payment notification verifier is configured.'}
            </CheckCard>
            {pricePlans.map(plan => {
                const check = checks.subscriptionPrices?.[priceKey(plan)];
                return <CheckCard key={priceKey(plan)} title={`${plan.name} · ${plan.interval === 'year' ? 'yearly' : 'monthly'}`} ready={check?.ready}>
                    {check?.ready
                        ? `The active price matches S$${plan.amount} per ${plan.interval}, billed in SGD.`
                        : priceIssues[check?.code] || 'This subscription price could not be verified. Check the payment configuration and try again.'}
                </CheckCard>;
            })}
            <div className="sm:col-span-2">
                <CheckCard title="Custom service images and reference files" ready={storage?.ready} deferred={storageDeferred}>
                    {storage?.ready
                        ? 'Private storage has all public-access blocks enabled. Uploads remain subject to file validation.'
                        : storageDeferred
                            ? 'Image and reference uploads are deferred. Written requests, service listings and pricing remain available.'
                            : 'Private storage could not be verified. Check its access policy before allowing image or reference uploads.'}
                </CheckCard>
            </div>
        </div>
    </main>;
}
