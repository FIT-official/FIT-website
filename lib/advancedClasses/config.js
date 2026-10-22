// Public-safe constants. Safe to import from client or server code: no identities, no content.
// The only address here is the existing public business contact that is already in the footer.

export const CONTACT_EMAIL = 'fixittoday.contact@gmail.com'
export const CONTACT_SUBJECT = 'Advanced Classes access enquiry'
export const CONTACT_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(CONTACT_SUBJECT)}`

export const RESTRICTED_NOTICE = 'Access restricted. Please email us to enquire about access.'

// Where the existing research project library lives, and the existing sign-in route returning to it.
export const LIBRARY_PATH = '/class/projects'
export const SIGN_IN_HREF = `/sign-in?redirect_url=${encodeURIComponent(LIBRARY_PATH)}`

export const ADMIN_PAGE_PATH = '/admin/advanced-classes'

// For the integration owner to feed the public navigation. Visible to everyone; access is decided on the server.
export const ADVANCED_CLASSES_NAV_ITEM = Object.freeze({ label: 'Advanced Classes', href: LIBRARY_PATH })

// Opaque workspace id the research project adapter treats as the single attached class.
export const OWNER_WORKSPACE_ID = 'ac-owner-workspace'

export const PRIVATE_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  Vary: 'Cookie',
})
