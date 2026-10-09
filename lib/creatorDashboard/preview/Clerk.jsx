'use client';
// Resolved ONLY by the development fixture alias in next.config.mjs. Always
// signed out: there is no synthetic credential, session or privileged user.
const user = Object.freeze({ user: null, isLoaded: true, isSignedIn: false });
const auth = Object.freeze({ userId: null, isLoaded: true, isSignedIn: false, getToken: async () => null });
export const useUser = () => user;
export const useAuth = () => auth;
export const ClerkProvider = ({ children }) => children;
export const SignedOut = ({ children }) => children;
export const SignedIn = () => null;
export const SignOutButton = () => null;
