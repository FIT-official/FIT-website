import { clerkMiddleware, clerkClient, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPrivateRoute = createRouteMatcher(['/dashboard(.*)', '/account(.*)', '/onboarding', '/checkout(.*)', '/cart(.*)'])
const isOnboardingRoute = createRouteMatcher(['/onboarding'])
const isCheckoutReturnRoute = createRouteMatcher(['/checkout/return(.*)'])
const isApiRoute = createRouteMatcher(['/api(.*)', '/trpc(.*)'])
const isSsoCallback = createRouteMatcher(['/sign-up/sso-callback(.*)', '/sign-in/sso-callback(.*)'])

export default clerkMiddleware(async (auth, req) => {
    // API handlers enforce their own authentication/signatures. A browser
    // onboarding redirect must never replace JSON or consume a Stripe webhook.
    if (isApiRoute(req)) return NextResponse.next()
    // Clerk must finish OAuth account linking/session activation before any
    // onboarding or authenticated-signin redirect can run.
    if (isSsoCallback(req)) return NextResponse.next()
    const { userId, sessionClaims } = await auth()
    const homeUrl = new URL('/', req.url)
    let onboardingComplete = sessionClaims?.metadata?.onboardingComplete === true

    // Stripe return URLs must always be reachable (even if auth state is lost)
    if (isCheckoutReturnRoute(req)) {
        return NextResponse.next()
    }

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
        return NextResponse.redirect(new URL('/dashboard/shop', req.url))
    }

    // for users visiting /onboarding to complete, don't try to redirect
    if (userId && isOnboardingRoute(req) && !onboardingComplete) {
        return NextResponse.next()
    }

    // protect private routes
    if (!userId && isPrivateRoute(req)) {
        await auth.protect()
    }

    // if metadata doesn't include onboardingComplete, redirect to onboarding
    if (userId && !onboardingComplete) {
        const onboardingUrl = new URL('/onboarding', req.url)
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
})


export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
}
