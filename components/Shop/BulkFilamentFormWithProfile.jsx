'use client'
import BulkFilamentForm from './BulkFilamentForm'
import useAccountProfile from '@/components/General/useAccountProfile'

// Signed-in visitors get name, email, phone and saved area prefilled; guests see the plain form.
export default function BulkFilamentFormWithProfile() {
  return <BulkFilamentForm prefill={useAccountProfile()} />
}
