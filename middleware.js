import { clerkMiddleware, clerkClient, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { isUnlistedBlogPath } from '@/lib/blog/unlistedRobots'
import { subscriptionIntentTarget, subscriptionPriceId, withSubscriptionIntent } from '@/lib/subscriptionIntent'
import { maintenanceResponse } from '@/lib/maintenance/middleware'

const isPrivateRoute = createRouteMatcher(['/dashboard(.*)', '/account(.*)', '/admin(.*)', '/onboarding'])
const isOnboardingRoute = createRouteMatcher(['/onboarding'])
const isStoreRoute = createRouteMatcher(['/shop(.*)', '/products(.*)', '/cart(.*)', '/checkout(.*)'])
const isServicePage = createRouteMatcher(['/research-fabrication', '/metal-fabrication', '/3d-design-printing', '/electronics-prototyping', '/printer-repair', '/maker-tools', '/guides/3d-printing-problems', '/guides/3d-printing-problems/', '/community', '/community/(.*)', '/prints', '/prints/', '/prints/request', '/prints/request/'])
const isApiRoute = createRouteMatcher(['/api(.*)', '/trpc(.*)'])
const isSsoCallback = createRouteMatcher(['/sign-up/sso-callback(.*)', '/sign-in/sso-callback(.*)'])
const isMakerPlayground = createRouteMatcher(['/maker-tools/playground', '/maker-tools/playground/'])

async function handleRequest(auth, req) {
    // API handlers enforce their own authentication/signatures. A browser
    // onboarding redirect must never replace JSON or consume a Stripe webhook.
    if (isApiRoute(req)) return NextResponse.next()
    const maintenance = await maintenanceResponse(auth, req)
    if (maintenance) return maintenance
    // Public learning pages still respect the shared maintenance gate.
    if (isMakerPlayground(req)) return NextResponse.next()
    // Clerk must finish OAuth account linking/session activation before any
    // onboarding or authenticated-signin redirect can run.
    if (isSsoCallback(req)) return NextResponse.next()
    // Shopping and payment recovery do not depend on account onboarding.
    if (isStoreRoute(req)) return NextResponse.next()
    // Reading service information and starting an email enquiry needs no account setup.
    if (isServicePage(req)) return NextResponse.next()
    const { userId, sessionClaims } = await auth()
    const priceId = subscriptionPriceId(new URL(req.url).searchParams.get('priceId'))
    const homeUrl = new URL(subscriptionIntentTarget(priceId, '/'), req.url)
    let onboardingComplete = sessionClaims?.metadata?.onboardingComplete === true

    // Claims may be absent from the token template or briefly stale following
    // onboarding. Check authoritative metadata before redirecting back again.
    if (userId && !onboardingComplete) {
        try {
            const user = await (await clerkClient()).users.getUser(userId)
            onboardingComplete = user?.publicMetadata?.onboardingComplete === true
        } catch {
            return new NextResponse('Unable to load your account. Please try again.', { status: 503 })
        }
    }

    // for users who finished onboarding, redirect to home
    if (userId && isOnboardingRoute(req) && onboardingComplete) {
        return NextResponse.redirect(new URL(subscriptionIntentTarget(priceId, '/dashboard/shop'), req.url))
    }

    // for users visiting /onboarding to complete, don't try to redirect
    if (userId && isOnboardingRoute(req) && !onboardingComplete) {
        return NextResponse.next()
    }

    // protect private routes
    if (!userId && isPrivateRoute(req)) {
        if (priceId) return NextResponse.redirect(new URL(withSubscriptionIntent('/sign-in', priceId), req.url))
        await auth.protect()
    }

    // if metadata doesn't include onboardingComplete, redirect to onboarding
    if (userId && !onboardingComplete) {
        const onboardingUrl = new URL(withSubscriptionIntent('/onboarding', priceId), req.url)
        return NextResponse.redirect(onboardingUrl)
    }

    const signInSignUpRoutes = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])

    // Redirect authenticated users away from sign-in and sign-up pages
    if (userId && signInSignUpRoutes(req)) {
        return NextResponse.redirect(homeUrl)
    }

    // Free creators have dashboard access; paid limits are enforced server-side.
    if (userId && isPrivateRoute(req)) {
        return NextResponse.next()
    }
}

export default clerkMiddleware(async (auth, req) => {
    const response = await handleRequest(auth, req)
    if (await isUnlistedBlogPath(new URL(req.url).pathname)) {
        const result = response || NextResponse.next()
        result.headers.set('X-Robots-Tag', 'noindex, nofollow')
        return result
    }
    return response
})

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
        '/blog/:path*',
    ],
}
