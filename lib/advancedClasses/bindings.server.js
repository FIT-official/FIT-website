import 'server-only'
import { OWNER_WORKSPACE_ID } from './config.js'

// SERVER-ONLY exact account bindings. Never import this from a client component, the RestrictedPreview
// or anything that reaches a public chunk. Identities below are deliberately not exported anywhere else.
//
// Provenance: both accounts were verified through the read-only production Clerk API on 2026-10-22 08:28 UTC.
// No account roles were changed for this module. The human narrowed tomorrow's audience to exactly these two
// existing owner accounts. This is a static reviewed list: there is no grant or revoke code path, and anything
// not listed (including any other admin) is denied. Each request still re-checks the live Clerk account.
//
// Fields
//   userId        exact Clerk user id
//   expectedEmail the verified primary email that live Clerk data must still report
//   review        whether this binding may use teacher review. Even when true, the live Clerk
//                 publicMetadata.role must be 'admin' at request time; the personal account is never granted it.
//   memberScope   opaque id for the account's own project answers inside the owner workspace

export const BINDINGS_PROVENANCE = Object.freeze({
  checkedAt: '2026-10-22T08:28:00Z',
  source: 'Read-only production Clerk API lookup by the delegating human/agent on 2026-10-22 08:28 UTC',
  roleChanges: 'None',
  audience: 'Two existing owner accounts only, for tomorrow',
})

const entry = (value) => Object.freeze({ workspaceId: OWNER_WORKSPACE_ID, content: 'full-library', personalWork: true, checkedAt: BINDINGS_PROVENANCE.checkedAt, ...value })

export const OWNER_BINDINGS = Object.freeze([
  entry({
    userId: 'user_35KQJAephgWnwhNfPkBCpfZyV2Z',
    label: 'Fix It Today',
    expectedEmail: 'fixittoday.contact@gmail.com',
    review: true,
    memberScope: 'ac-m-fit-2c91e7',
    note: 'Existing publicMetadata.role admin at check time. Teacher review stays tied to that live role.',
  }),
  entry({
    userId: 'user_3JoE2MXxLVzXFL6CZQPFwHbGvAv',
    label: 'Lee Wen Wei',
    expectedEmail: 'lwwenwei@gmail.com',
    review: false,
    memberScope: 'ac-m-lww-9d40b3',
    note: 'Existing role user at check time. Saves its own answers only; no teacher or admin access.',
  }),
])
