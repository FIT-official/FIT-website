export const fixtureProduct = () => ({
  _id: '111111111111111111111111', name: 'Synthetic PLA rolls', slug: 'synthetic-pla',
  productType: 'shop', listing: 'fit', categoryId: 'Filament', subcategoryId: 'PLA',
  stock: 12, basePrice: { presentmentAmount: 10, presentmentCurrency: 'SGD' },
  variantTypes: [
    { _id: '222222222222222222222222', name: 'Colour', options: [
      { _id: '333333333333333333333333', name: 'Black', stock: 5, additionalFee: 0 },
      { _id: '444444444444444444444444', name: 'White', stock: 7, additionalFee: 0 },
    ] },
    { _id: '555555555555555555555555', name: 'Spool', options: [
      { _id: '666666666666666666666666', name: 'Without Spool', stock: 6, additionalFee: 0 },
      { _id: '777777777777777777777777', name: 'With Spool', stock: 6, additionalFee: 4 },
    ] },
  ],
})
export const fixtureInput = catalogue => ({
  clientRequestId: '12345678-1234-4234-8234-123456789abc', confirmReview: true,
  customer: { name: 'Synthetic QA', email: 'qa@example.invalid', phone: '+65 8000 0000' },
  fulfilment: 'collection', address: '', notes: 'SYNTHETIC TEST ONLY',
  lines: [{ productId: catalogue[0].id, version: catalogue[0].version,
    options: catalogue[0].types.map(t => ({ typeId: t.id, optionId: t.options[0].id })),
    recordedQuantity: 2, extraQuantity: 20, remarks: 'Do not fulfil' }],
})
