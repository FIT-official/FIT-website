'use client'
import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'

// Signed-in prefill: name, email, phone, saved area and address from /api/user/profile (own account only).
export default function useAccountProfile() {
  const { isLoaded, isSignedIn, user } = useUser()
  const [profile, setProfile] = useState(null)
  useEffect(() => {
    if (!isLoaded || !isSignedIn) { setProfile(null); return }
    const controller = new AbortController()
    fetch('/api/user/profile', { cache: 'no-store', signal: controller.signal }).then(r => (r.ok ? r.json() : null)).then(body => setProfile(body?.profile || null)).catch(() => {})
    return () => controller.abort()
  }, [isLoaded, isSignedIn, user?.id])
  return profile
}