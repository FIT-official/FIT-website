// SYNTHETIC FIXTURES. These are not real Clerk users and no provider is ever called.
// Ids and emails below are invented for tests. They only imitate the shape of Clerk's user object.

export const FIT = 'user_SYNTHETIC_FIT'
export const PERSONAL = 'user_SYNTHETIC_PERSONAL'
export const OTHER_ADMIN = 'user_SYNTHETIC_OTHER_ADMIN'
export const STRANGER = 'user_SYNTHETIC_STRANGER'

export const BINDINGS = [
  { userId: FIT, label: 'Synthetic FIT', expectedEmail: 'synthetic-fit@example.test', review: true, memberScope: 'ac-m-synth-fit', workspaceId: 'ac-synth-workspace', content: 'full-library', personalWork: true, checkedAt: '2026-01-01T00:00:00Z', note: 'synthetic' },
  { userId: PERSONAL, label: 'Synthetic personal', expectedEmail: 'synthetic-personal@example.test', review: false, memberScope: 'ac-m-synth-personal', workspaceId: 'ac-synth-workspace', content: 'full-library', personalWork: true, checkedAt: '2026-01-01T00:00:00Z', note: 'synthetic' },
]

export const PROVENANCE = { checkedAt: '2026-01-01T00:00:00Z', source: 'Synthetic test fixture', roleChanges: 'None', audience: 'Synthetic' }

export function clerkUser(id, email, { role = 'user', status = 'verified', primary = true, extra = {} } = {}) {
  return {
    id,
    primaryEmailAddressId: primary ? 'idn_1' : 'idn_other',
    emailAddresses: [{ id: 'idn_1', emailAddress: email, verification: { status } }],
    publicMetadata: { role },
    ...extra,
  }
}

export function directory(overrides = {}) {
  const users = {
    [FIT]: clerkUser(FIT, 'synthetic-fit@example.test', { role: 'admin' }),
    [PERSONAL]: clerkUser(PERSONAL, 'synthetic-personal@example.test', { role: 'user' }),
    [OTHER_ADMIN]: clerkUser(OTHER_ADMIN, 'other@example.test', { role: 'admin' }),
    [STRANGER]: clerkUser(STRANGER, 'stranger@example.test'),
    ...overrides,
  }
  const calls = []
  const fetchUser = async (id) => {
    calls.push(id)
    if (!users[id]) throw new Error('not found')
    const value = users[id]
    if (value instanceof Error) throw value
    return value
  }
  return { fetchUser, calls, users }
}

export const adminDeps = ({ userId, fetchUser, unauthorised = false, isAdmin } = {}) => ({
  async authenticate() {
    if (unauthorised) { const e = new Error('Unauthorized'); e.name = 'UnauthorizedError'; throw e }
    return userId
  },
  isAdmin: isAdmin || (async (id) => id === FIT || id === OTHER_ADMIN),
  fetchUser,
  bindings: BINDINGS,
  provenance: PROVENANCE,
  now: () => new Date('2026-10-22T09:00:00Z'),
})
