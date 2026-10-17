'use client'
// Customer account hub, rebuilt on the "Sunlit Paper" design language
// (docs/DASHBOARD-UX-BLUEPRINT.md §4/§9/§10). Every legacy capability is kept:
// profile editing, security (password/devices/delete), billing contact, order
// history, digital downloads. ?tab= deep links (used by the cart and product
// pages) keep working and now cover every section.
import React, { useEffect, useState } from 'react'
import { useUser, useSession } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'
import AccountShell, { ACCOUNT_SECTIONS } from '@/components/Account/AccountShell'
import AccountIdentityHero from '@/components/Account/AccountIdentityHero'
import AccountOverview from '@/components/Account/AccountOverview'
import ContactSection from '@/components/Account/ContactSection'
import AreaSetting from '@/components/Account/AreaSetting'
import OrderSection from '@/components/Account/OrderSection'
import ProfileSettings from '@/components/Account/ProfileSettings'
import SecuritySettings from '@/components/Account/SecuritySettings'
import DownloadsSection from '@/components/Account/DownloadsSection'

const TAB_KEYS = ACCOUNT_SECTIONS.map((s) => s.key)

function Account() {
    const { user, isLoaded } = useUser()
    const { session: currentSession } = useSession()
    const searchParams = useSearchParams()

    const [tab, setTab] = useState('overview')
    const [connectedAccounts, setConnectedAccounts] = useState([])
    const [devices, setDevices] = useState([])

    // ?tab= deep links (cart → billing, product downloads → downloads, ...).
    useEffect(() => {
        const tabParam = searchParams.get('tab')
        if (tabParam && TAB_KEYS.includes(tabParam)) {
            setTab(tabParam)
        }
    }, [searchParams])

    useEffect(() => {
        if (!isLoaded || !user) return
        setConnectedAccounts(user.externalAccounts || [])
        ;(async () => {
            if (typeof user.getSessions === 'function') {
                try {
                    const sessions = await user.getSessions()
                    setDevices(sessions || [])
                } catch (err) {
                    setDevices([])
                }
            } else {
                setDevices(user.sessions || [])
            }
        })()
    }, [isLoaded, user])

    // Switch sections in place and keep the URL shareable/deep-linkable.
    const selectTab = (key) => {
        setTab(key)
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href)
            url.searchParams.set('tab', key)
            window.history.replaceState(null, '', url)
        }
    }

    // Calm identity band: avatar (with the Clerk photo-change affordance),
    // name at display scale, member-since and the plan chip. No boxy card.
    const header = <AccountIdentityHero user={user} isLoaded={isLoaded} />

    return (
        <AccountShell active={tab} onSelect={selectTab} header={header}>
            {tab === 'overview' && (
                <AccountOverview user={user} isLoaded={isLoaded} onSelect={selectTab} />
            )}
            {tab === 'profile' && (
                <ProfileSettings connectedAccounts={connectedAccounts} user={user} isLoaded={isLoaded} />
            )}
            {tab === 'security' && (
                <SecuritySettings user={user} devices={devices} currentSession={currentSession} />
            )}
            {tab === 'billing' && <><AreaSetting /><ContactSection /></>}
            {tab === 'orders' && <OrderSection />}
            {tab === 'downloads' && <DownloadsSection user={user} isLoaded={isLoaded} />}
        </AccountShell>
    )
}

export default Account
