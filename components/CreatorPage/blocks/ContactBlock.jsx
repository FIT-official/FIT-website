'use client'
// Contact: heading, a short blurb and the Message button that opens the
// existing creator chat (window event 'fit:openCreatorChat', consumed by
// components/Chat). Signed-in visitors only; never for the owner. In the
// builder preview the button is shown inert so the owner can see it.
import { useUser } from '@clerk/nextjs'
import { SectionHeading, sanitizeDisplayName, accentButtonStyle } from '../shared'

export default function ContactBlock({ settings = {}, creator, preview = false }) {
    const { user, isLoaded } = useUser()
    const viewerUserId = isLoaded ? (user?.id ? String(user.id) : null) : null
    const creatorUserId = creator?.id ? String(creator.id) : null
    const isSelf = !!(viewerUserId && creatorUserId && viewerUserId === creatorUserId)
    const canMessage = !!(viewerUserId && creatorUserId && !isSelf)
    const showButton = settings.showMessageButton !== false && (canMessage || preview)
    const accent = creator?.shop?.accentColor || ''
    const heading = settings.heading || 'Get in touch'
    const blurb = settings.blurb || ''

    if (!blurb && !showButton && !settings.heading) return null

    const messageCreator = () => {
        if (typeof window === 'undefined' || preview || isSelf) return
        window.dispatchEvent(
            new CustomEvent('fit:openCreatorChat', {
                detail: {
                    targetUserId: creator?.id,
                    displayName: sanitizeDisplayName(creator?.displayName, 'Unnamed Store'),
                    imageUrl: creator?.imageUrl || null,
                },
            })
        )
    }

    return (
        <div className="flex flex-col gap-4 rounded-md border border-borderColor bg-baseColor p-5 md:p-6">
            <div className="flex flex-col gap-1">
                <SectionHeading>{heading}</SectionHeading>
                {blurb && <p className="text-sm text-lightColor max-w-2xl whitespace-pre-line">{blurb}</p>}
            </div>
            {showButton && (
                <div>
                    <button
                        type="button"
                        className="formBlackButton w-fit border"
                        style={accentButtonStyle(accent)}
                        onClick={messageCreator}
                        disabled={preview}
                    >
                        Message creator
                    </button>
                </div>
            )}
        </div>
    )
}
