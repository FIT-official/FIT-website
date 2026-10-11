import { describe, it, expect } from 'vitest'
import { buildManualQuoteAdminEmail } from '@/lib/manualQuoteEmail'

const sampleRequest = {
  requestId: 'req-123',
  userEmail: 'ada@example.com',
  userName: 'Ada Lovelace',
  modelFile: { originalName: 'engine-block.stl' },
  printConfiguration: {
    printSettings: {
      materialType: 'pla',
      layerHeight: 0.2,
      wallLoops: 3,
      sparseInfillDensity: 25,
      enableSupport: true,
      supportType: 'Tree',
    },
    meshColors: { Mesh_0: '#ff0000', Mesh_1: '#00ff00' },
  },
}

describe('buildManualQuoteAdminEmail', () => {
  it('keeps the reference in the body and uses a readable subject', () => {
    const { subject, html } = buildManualQuoteAdminEmail({ request: sampleRequest })
    expect(subject).not.toMatch(/req-123/)
    expect(html).toMatch(/req-123/)
    expect(subject).toMatch(/manual quote/i)
  })

  it('html includes the customer, model name, and key settings', () => {
    const { html } = buildManualQuoteAdminEmail({ request: sampleRequest })
    expect(html).toMatch(/Ada Lovelace/)
    expect(html).toMatch(/engine-block\.stl/)
    expect(html).toMatch(/pla/i)
    expect(html).toMatch(/Per-mesh colours set:[^0-9]*2/)
    expect(html).toMatch(/Yes \(Tree\)/) // support type rendered
  })

  it('html escapes user-controlled values', () => {
    const dangerous = {
      ...sampleRequest,
      userName: '<script>alert(1)</script>',
      modelFile: { originalName: '<b>x</b>.stl' },
    }
    const { html } = buildManualQuoteAdminEmail({ request: dangerous })
    expect(html).not.toMatch(/<script>/)
    expect(html).toMatch(/&lt;script&gt;/)
    expect(html).toMatch(/&lt;b&gt;x&lt;\/b&gt;\.stl/)
  })

  it('survives a minimal/empty request', () => {
    const { subject, html } = buildManualQuoteAdminEmail({ request: { requestId: 'x' } })
    expect(subject).toMatch(/manual quote/i)
    expect(html).toMatch(/Custom print/)
    expect(html).toMatch(/none provided/i)
  })
})
