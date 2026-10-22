# Advanced Classes owner access and restricted preview: handoff

Base: `345e4858b17be1e0535614a5fb3737d0d9aafcd6`. Owned paths only. No shared auth, navigation, middleware, packages, researchProjects or existing classes were edited. No push, no deployment, no database writes, no provider calls (tests are synthetic).

## What exists

| Path | Purpose |
| --- | --- |
| `lib/advancedClasses/config.js` | Public-safe constants: contact mailto, exact notice text, sign-in href, `ADVANCED_CLASSES_NAV_ITEM`, `OWNER_WORKSPACE_ID`, private headers. No identities. |
| `lib/advancedClasses/bindings.server.js` | `import 'server-only'`. The two exact account bindings plus `BINDINGS_PROVENANCE` (checked 2026-10-22 08:28 UTC, read-only production Clerk API, no role changes). |
| `lib/advancedClasses/resolver.js` | Pure, injectable `resolveOwnerAccess({ userId, bindings, fetchUser })`. |
| `lib/advancedClasses/researchAdapter.js` | `createOwnerResearchDeps(...)`: builds deps for the existing research project `resolveAccess`. |
| `lib/advancedClasses/adminAccess.js` | `loadAdminAccessView`, `handleAccessGet`, `methodNotAllowed` (read-only admin view). |
| `lib/advancedClasses/defaults.server.js` | `server-only` production wiring: `defaultAdminDeps()`, `getOwnerGate()`, `ownerResearchInputs()`. |
| `components/AdvancedClasses/RestrictedPreview.jsx` + `.module.css` | Reusable public preview. |
| `components/AdvancedClasses/AdminAccessView.jsx` | Server-rendered read-only admin view. |
| `app/admin/advanced-classes/page.jsx` | Protected read-only page, `force-dynamic`, noindex. |
| `app/api/admin/advanced-classes/access/route.js` | JSON GET; POST/PUT/PATCH/DELETE return 405. Private, no-store, noindex. |
| `tests/advancedClasses/**` | 46 tests, all synthetic (see Tests). |

## Access rules (all default deny)

- Unknown user id: denied before any provider call. This includes every other admin.
- Known id: one live Clerk `getUser` per check. Allowed only when the returned `id` matches, the account is not banned or locked, the **primary** email equals the bound email exactly (case-insensitive, no domain or substring matching) and its `verification.status` is `verified`.
- Any provider error, missing user or malformed user is a denial. Error detail never leaves the server.
- Teacher review (`scope.review`) needs binding `review: true` AND live `publicMetadata.role === 'admin'`. Only the FIT account has `review: true`. If it loses admin it keeps its own answers but loses review. The personal account is never granted review, even if it later becomes admin. No roles were changed.
- Scope returned for an allowed owner: `content: 'full-library'`, `personalWork: true`, `review: boolean`, an `ac-owner-workspace` workspace and an opaque `memberScope` (`ac-m-fit-2c91e7`, `ac-m-lww-9d40b3`). Old school classes are not bound.

## Integration seams (for the integration owner)

1. **Nav**: add `ADVANCED_CLASSES_NAV_ITEM` (`{ label: 'Advanced Classes', href: '/class/projects' }`) to the public navigation. Make `/class/projects` publicly reachable in `middleware.js` (it must render the preview to anonymous visitors); access is decided in the page, not the middleware. The middleware change also needs `/api/research-projects/**` to keep rejecting anonymous callers as it does today.
2. **Page gate** in `app/class/projects/page.jsx` (and the `[slug]` page):

   ```jsx
   import RestrictedPreview from '@/components/AdvancedClasses/RestrictedPreview'
   import { getOwnerGate } from '@/lib/advancedClasses/defaults.server'

   const gate = await getOwnerGate()
   if (!gate.allowed) return <RestrictedPreview />
   // otherwise render the existing library; gate.review says whether the teacher panel may show
   ```

   `getOwnerGate()` returns only `{ allowed, signedIn, review }`. Signed-in but unlisted users see the same preview as anonymous ones.
3. **Research project adapter**: replace the empty `ATTACHED_CLASS_IDS`/`activeMembership` seam per request, without editing researchProjects:

   ```js
   import { defaultDeps } from '@/lib/researchProjects/deps'
   import { createOwnerResearchDeps } from '@/lib/advancedClasses/researchAdapter'
   import { ownerResearchInputs } from '@/lib/advancedClasses/defaults.server'

   const owner = (mode) => createOwnerResearchDeps({ baseDeps: defaultDeps(), mode, ...ownerResearchInputs() })
   // student routes (read library, load and save own answers):   owner('student')
   // teacher/review routes (keys, review actions):                owner('teacher')
   ```

   Create a new instance per request (it memoises one live provider check per user). `student` mode always reports `isAdmin: false`, so an owner saves answers under its own opaque `memberScope`. `teacher` mode reports `isAdmin: true` only for the FIT account with a live admin role; other admins and the personal account are denied teacher. The existing adapter treats `teacher` as reviewing other members, so FIT saves its own answers through `student` mode and reviews the personal account's record in `teacher` mode (target `classId=ac-owner-workspace`, `memberId=ac-m-lww-9d40b3`). The plain `defaultDeps()` `isAdmin` would let any admin in, so the owner deps must be used on all research project routes.
4. **Admin link**: optionally link `/admin/advanced-classes` from the admin index. It is not linked from anywhere by this module.

## Public preview

`RestrictedPreview` imports only `config.js`. A generic, text-free skeleton (cards and bars) is blurred and is `aria-hidden` and non-interactive. The notice (exact text: "Access restricted. Please email us to enquire about access."), the `mailto:` contact and the sign-in link (`/sign-in?redirect_url=%2Fclass%2Fprojects`) sit on an opaque white card, outside the blurred subtree. Dark-on-white and blue-on-white colours are chosen for contrast (about 18:1 and 8.9:1 by calculation, not measured in a browser). Visible focus ring, stacked full-width buttons at 30rem and below. This is a public preview, not a hiding mechanism: the page must not render private content for unauthorised visitors.

## Admin view

`/admin/advanced-classes` and `GET /api/admin/advanced-classes/access` authenticate and check the existing admin role first. Only then do they read the bindings and fetch live state. They return account id, expected email, scope, live state (`verified`, `provider_unavailable`, `email_mismatch`, `email_unverified`, `account_mismatch`, `account_blocked`), effective scope, binding provenance and the view-only policy text. Any admin can view the list; viewing does not grant library access. 401 anonymous, 403 non-admin, 503 on authentication faults, with generic bodies.

## Tests

Run: `node ../node_modules/vitest/vitest.mjs run tests/advancedClasses` and `node ../node_modules/eslint/bin/eslint.js lib/advancedClasses components/AdvancedClasses app/admin/advanced-classes app/api/admin/advanced-classes tests/advancedClasses`.

All fixtures are SYNTHETIC (`tests/advancedClasses/fixtures.js`: `user_SYNTHETIC_*`, `*@example.test`). `route.test.js` uses the real server-only bindings with mocked `@clerk/nextjs/server`, `@/lib/authenticate` and `@/lib/checkPrivileges`. `researchAdapter.test.js` runs the sibling checkout's real `resolveAccess` in a child Node process (read only); it is skipped when `../projects/lib/researchProjects/access.js` is absent. Covered: anonymous, unrelated signed-in and other-admin denial; both owners allowed only when verified; FIT review requires live admin; personal account never gets review; unverified, mismatched, non-primary, banned and locked accounts denied; provider failure denied; admin API 401/403 with no identities, write methods 405, no-store/noindex headers; preview markup has no lesson text, keys, ids or emails other than the public contact; keyboard order; blur only on the backdrop; no client file references server-only bindings.

## Limitations

- Nothing here has run against real Clerk or in a browser. No visual, mobile or contrast measurement was done; contrast figures are from the colour values.
- The preview and admin page were not wired into navigation, middleware or `/class/projects`; seams 1-3 are the integration owner's.
- Each gate check costs one Clerk `getUser` call per request (the admin view costs one per binding, so two). No caching, by design (role or email changes apply immediately).
- The binding list is static. Changing it needs a reviewed code change. Binding identities were taken from the supplied read-only verification and not re-fetched.
- `server-only` is imported but not listed in `package.json` (packages were out of scope). It resolves through Next's own bundled handling and via the parent `node_modules` in this checkout.

## Commit

See `git log -1` on branch `feat/research-projects-additional-20261022` (hash recorded in the final report; a commit cannot contain its own hash).
