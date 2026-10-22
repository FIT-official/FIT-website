import Link from 'next/link'
import { POLICY_TEXT } from '@/lib/advancedClasses/adminAccess'

// Server-rendered, read-only. Receives the already authorised view from loadAdminAccessView; no controls.

const STATE_TEXT = {
  verified: 'Verified now',
  provider_unavailable: 'Could not be checked: access denied',
  email_mismatch: 'Email no longer matches: access denied',
  email_unverified: 'Email not verified: access denied',
  account_mismatch: 'Account mismatch: access denied',
  account_blocked: 'Account blocked: access denied',
}

const yesNo = (value) => (value ? 'Yes' : 'No')

export function AccessMessage({ title, children, signInHref }) {
  return (
    <main className="mx-auto max-w-2xl space-y-5 px-6 py-16 text-textColor">
      <h1>{title}</h1>
      <p className="text-lightColor">{children}</p>
      <Link href={signInHref || '/admin'} className="inline-block text-sm underline">{signInHref ? 'Sign in' : 'Back to admin'}</Link>
    </main>
  )
}

export default function AdminAccessView({ view }) {
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-10 text-textColor">
      <header className="space-y-2">
        <h1>Advanced Classes access</h1>
        <p role="note" className="text-lightColor">{view.explanation || POLICY_TEXT}</p>
        <p className="text-sm text-lightColor">Live check at {view.liveCheckedAt}. Other accounts: {view.defaultForOthers}.</p>
      </header>
      {view.accounts.map((account) => (
        <section key={account.userId} aria-labelledby={`ac-${account.workspaceId}-${account.userId}`} className="space-y-3 rounded-xl border border-borderColor bg-background p-5">
          <h2 id={`ac-${account.workspaceId}-${account.userId}`} className="text-base font-semibold">{account.label}</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-[14rem_1fr]">
            <dt>Account ID</dt><dd className="break-all">{account.userId}</dd>
            <dt>Expected verified email</dt><dd className="break-all">{account.email}</dd>
            <dt>Live verification</dt><dd>{STATE_TEXT[account.verification.state] || 'Denied'}</dd>
            <dt>Content scope</dt><dd>{account.scope.content} (effective: {account.verification.effective.content})</dd>
            <dt>Own project answers</dt><dd>Approved {yesNo(account.scope.personalWork)}; effective {yesNo(account.verification.effective.personalWork)}</dd>
            <dt>Teacher review</dt><dd>Approved {yesNo(account.scope.review)}{account.reviewRequiresLiveAdminRole ? ' (needs live admin role)' : ''}; effective {yesNo(account.verification.effective.review)}</dd>
            <dt>Live admin role</dt><dd>{account.verification.liveAdminRole === null ? 'Not checked' : yesNo(account.verification.liveAdminRole)}</dd>
            <dt>Binding checked</dt><dd>{account.bindingCheckedAt}</dd>
            <dt>Note</dt><dd>{account.note}</dd>
          </dl>
        </section>
      ))}
      <footer className="space-y-1 text-sm text-lightColor">
        <h2 className="text-base font-semibold">Provenance</h2>
        <p>{view.provenance.source}.</p>
        <p>Checked at {view.provenance.checkedAt}. Role changes: {view.provenance.roleChanges}. Audience: {view.provenance.audience}.</p>
      </footer>
    </main>
  )
}
