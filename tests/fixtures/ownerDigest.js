export function guidedFixture() {
  return { requestId: 'guided-synthetic-1', userId: 'synthetic-a', userName: 'Synthetic Customer', userEmail: 'synthetic@example.invalid',
    status: 'configured', guidedFingerprint: 'saved-brief-fingerprint', guidedAssetId: 'synthetic-private-reference',
    guidedBrief: { version: 1, purpose: 'Desk bracket', category: 'Replacement part', sourceUrl: 'https://example.com/design/1',
      sizeMode: 'longest', size: 10, sizeMm: 100, unit: 'cm', quantity: 3, material: 'pla', colour: 'White', rights: 'unknown',
      permissionNote: 'Please review this model', notes: 'Bag copies separately\nKeep the labels' } }
}
export function paidFixture() {
  const checkout = { sessionId: 'cs_synthetic_paid', userId: 'synthetic-a', snapshotVersion: 1, status: 'completed', currency: 'sgd',
    customerName: 'Synthetic Customer', customerPhone: { countryCode: '+65', number: '80000000' }, customerEmail: 'synthetic@example.invalid',
    shippingAddress: { street: '1 Synthetic Road', unitNumber: '#01-01', city: 'Singapore', country: 'SG', postalCode: '000000' },
    totalAmount: 4020, items: [
      { cartItemId: 'line-a', productId: 'synthetic-spool', productName: 'Synthetic filament', productSlug: 'synthetic-filament',
        quantity: 2, chosenDeliveryType: 'standard-shipping', selectedVariants: { Colour: 'White', Packaging: 'Refill' },
        variantInfo: [{ type: 'Colour', option: 'White', additionalFee: 0 }], orderNote: 'Keep both refills labelled',
        unitAmount: 1200, deliveryAmount: 620, totalAmount: 3020, currency: 'sgd', paidAssets: ['private-do-not-include.stl'] },
      { cartItemId: 'line-b', productId: 'synthetic-print', productName: 'Synthetic print batch', productSlug: 'synthetic-print',
        requestId: 'guided-synthetic-1', quantity: 1, chosenDeliveryType: 'standard-shipping', selectedVariants: {}, variantInfo: [],
        orderNote: '<script>test</script> Protect the small tabs', unitAmount: 1000, deliveryAmount: 0, totalAmount: 1000, currency: 'sgd',
        customRequest: { ...guidedFixture(), modelFile: { originalName: 'bracket.stl', s3Key: 'secret-private-key', s3Url: 'https://private.example.invalid/signed-secret' },
          guidedReview: { status: 'approved', exactFile: 'bracket.stl version 2', reviewedBy: 'synthetic-staff', scopeConfirmed: true, licenceEvidence: 'Synthetic job-specific permission record'  },
          quote: { inputs: { options: { postProcessing: true, specialRequest: false, priority: false, expedite: true } } },
          printConfiguration: { printSettings: { filamentType: 'pla', layerHeight: 0.2, wallLoops: 3, sparseInfillDensity: 20, enableSupport: false },
            meshColors: { part: '#FFFFFF' }, generic: { strength: 'Strong' } } } },
    ] }
  const order = { orderId: 'ORD_cs_synthetic_paid', stripeSessionId: checkout.sessionId, userId: checkout.userId, status: 'pending', currency: 'SGD',
    totalAmount: 40.2, stripePaymentIntentId: 'pi_synthetic_paid', paidConfirmedAt: new Date('2026-10-10T12:00:00Z'),
    paymentMethod: { type: 'card', brand: 'visa', last4: '4242', expiryMonth: 12, expiryYear: 2099 } }
  return { checkout, order }
}

const read = (doc, key) => key.split('.').reduce((value, part) => value?.[part], doc)
function set(doc, key, value) { const parts = key.split('.'), end = parts.pop(); let out = doc; for (const part of parts) out = out[part] ||= {}; out[end] = value }
export function memoryStore(initial) {
  let row = structuredClone(initial)
  const calls = []
  const matches = filter => Object.entries(filter).every(([key, want]) => {
    const value = read(row, key)
    if (want && typeof want === 'object' && !Array.isArray(want)) return Object.entries(want).every(([op, expected]) => {
      if (op === '$exists') return (value !== undefined) === expected
      if (op === '$in') return expected.includes(value)
      if (op === '$gte') return value >= expected
      if (op === '$lt') return value < expected
      throw Error('Unexpected operator ' + op)
    })
    return value === want
  })
  return { calls, get row() { return row }, mutate(fn) { fn(row) },
    async findOne(filter) { return matches(filter) ? structuredClone(row) : null },
    async findOneAndUpdate(filter, update, options) {
      calls.push({ filter: structuredClone(filter), update: structuredClone(update), options: structuredClone(options) })
      if (!matches(filter)) return null
      for (const [key, value] of Object.entries(update.$set || {})) set(row, key, structuredClone(value))
      for (const [key, amount] of Object.entries(update.$inc || {})) set(row, key, read(row, key) + amount)
      return structuredClone(row)
    },
  }
}
