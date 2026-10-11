import { describe, it, expect } from 'vitest'
import { selectIdleRequests, NUDGE_ELIGIBLE_STATUSES } from '@/lib/notifications/idleRequests'
import { buildIdleNudgeEmail } from '@/lib/email/templates/customPrint'

const NOW = new Date('2026-06-13T00:00:00Z').getTime()
const daysAgo = (n) => new Date(NOW - n * 24 * 60 * 60 * 1000)

const make = (overrides = {}) => ({
  requestId: 'r1',
  userEmail: 'a@test.com',
  status: 'pending_config',
  updatedAt: daysAgo(5),
  idleNudgeSentAt: null,
  ...overrides,
})

describe('selectIdleRequests', () => {
  it('returns [] for non-array input', () => {
    expect(selectIdleRequests(null)).toEqual([])
  })

  it('selects an eligible, idle, never-nudged request', () => {
    const out = selectIdleRequests([make()], { now: NOW, idleDays: 3 })
    expect(out).toHaveLength(1)
  })

  it('skips requests below the idle threshold', () => {
    const out = selectIdleRequests([make({ updatedAt: daysAgo(1) })], { now: NOW, idleDays: 3 })
    expect(out).toHaveLength(0)
  })

  it('skips ineligible statuses (paid/pending_upload/printing)', () => {
    for (const status of ['paid', 'pending_upload', 'printing', 'cancelled', 'delivered']) {
      expect(selectIdleRequests([make({ status })], { now: NOW, idleDays: 3 })).toHaveLength(0)
    }
  })

  it('respects the cooldown since the last nudge', () => {
    const recently = selectIdleRequests([make({ idleNudgeSentAt: daysAgo(2) })], {
      now: NOW,
      idleDays: 3,
      cooldownDays: 7,
    })
    expect(recently).toHaveLength(0)

    const longAgo = selectIdleRequests([make({ idleNudgeSentAt: daysAgo(10) })], {
      now: NOW,
      idleDays: 3,
      cooldownDays: 7,
    })
    expect(longAgo).toHaveLength(1)
  })

  it('skips requests with no email', () => {
    expect(selectIdleRequests([make({ userEmail: '' })], { now: NOW })).toHaveLength(0)
  })

  it('every eligible status is a valid pre-payment state', () => {
    expect(NUDGE_ELIGIBLE_STATUSES).toEqual(['pending_config', 'configured', 'quoted'])
  })
})

describe('buildIdleNudgeEmail', () => {
  it('tailors copy + CTA to the status and includes the request id', () => {
    const { subject, html } = buildIdleNudgeEmail({
      request: { requestId: 'r9', userName: 'Ada', status: 'quoted', modelFile: { originalName: 'm.stl' } },
    })
    expect(subject).toMatch(/ready to review/i)
    expect(html).toContain('Ada')
    expect(html).toContain('r9')
    expect(html).toContain('m.stl')
    expect(html.toLowerCase()).toContain('pay') // quoted → review & pay CTA
  })

  it('does not send a reminder for an unknown status', () => {
    expect(buildIdleNudgeEmail({ request: { requestId: 'r0', status: 'weird' } })).toBeNull()
  })
})
