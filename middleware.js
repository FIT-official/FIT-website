import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPrivateRoute = createRouteMatcher(['/dashboard(.*)', '/account(.*)', '/onboarding', '/checkout(.*)', '/cart(.*)'])
const isOnboardingRoute = createRouteMatcher(['/onboarding'])

export default clerkMiddleware(async (auth, req) => {
    const { userId, sessionClaims, redirectToSignIn } = await auth()
    const homeUrl = new URL('/', req.url)

    // for users who finished onboarding, redirect to home
    if (userId && isOnboardingRoute(req) && sessionClaims?.metadata?.onboardingComplete) {
        return NextResponse.redirect(homeUrl)
    }

    // for users visiting /onboarding to complete, don't try to redirect
    if (userId && isOnboardingRoute(req) && !sessionClaims?.metadata?.onboardingComplete) {
        return NextResponse.next()
    }

    // protect private routes
    if (!userId && isPrivateRoute(req)) {
        await auth.protect()
    }

    // if metadata doesn't include onboardingComplete, redirect to onboarding
    if (userId && !sessionClaims?.metadata?.onboardingComplete) {
        const onboardingUrl = new URL('/onboarding', req.url)
        return NextResponse.redirect(onboardingUrl)
    }

    const signInSignUpRoutes = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])

    // Redirect authenticated users away from sign-in and sign-up pages
    if (userId && signInSignUpRoutes(req)) {
        return NextResponse.redirect(homeUrl)
    }

    // Allow authenticated users to access private routes
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