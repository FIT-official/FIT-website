// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('creator price configuration preview', () => {
    it('previews four prices with stable monthly lookup keys and monthly allowances', () => {
        const output = execFileSync(process.execPath, ['scripts/configure-creator-plans.mjs'], {
            cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, STRIPE_SECRET_KEY: '' },
        })
        const preview = JSON.parse(output)
        expect(preview.mode).toBe('preview')
        expect(preview.plans.map(plan => [plan.name, plan.amount, plan.interval, plan.lookupKey, plan.environmentKey])).toEqual([
            ['Standard', 39, 'month', 'fit_creator_standard_sgd_monthly_v1', 'STRIPE_STANDARD_MONTHLY_PRICE_ID'],
            ['Standard', 390, 'year', 'fit_creator_standard_sgd_yearly_v1', 'STRIPE_STANDARD_YEARLY_PRICE_ID'],
            ['Pro', 99, 'month', 'fit_creator_pro_sgd_monthly_v1', 'STRIPE_PRO_MONTHLY_PRICE_ID'],
            ['Pro', 990, 'year', 'fit_creator_pro_sgd_yearly_v1', 'STRIPE_PRO_YEARLY_PRICE_ID'],
        ])
        expect(preview.plans.map(plan => plan.limits.monthlyPrintRequests)).toEqual([100, 100, 500, 500])
    })
})
