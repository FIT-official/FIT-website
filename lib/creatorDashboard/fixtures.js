// Synthetic acceptance data. No customer records, addresses or credentials.
export const fixtureToken = '1234567890abcdef1234567890abcdef';
export const fixtureOrders = [
    { _id: '100000000000000000000001', orderId: '200000000000000000000001', storeId: 'user_demo_maker',
        items: [{ productId: 'demo-dragon', name: 'Dragon keychain', qty: 4, price: 8, productType: 'print' }],
        fulfilment: 'fit', status: 'in_production', createdAt: '2026-10-09T08:00:00Z',
        statusHistory: [{ status: 'paid', at: '2026-10-09T08:00:00Z' }, { status: 'in_production', at: '2026-10-09T09:20:00Z' }] },
    { _id: '100000000000000000000002', orderId: '200000000000000000000002', storeId: 'user_demo_studio',
        items: [{ productId: 'demo-planter', name: 'Ribbed planter', qty: 2, price: 18, productType: 'print' }],
        fulfilment: 'fit', status: 'qc', createdAt: '2026-10-08T08:00:00Z',
        statusHistory: [{ status: 'paid', at: '2026-10-08T08:00:00Z' }, { status: 'in_production', at: '2026-10-08T09:00:00Z' }, { status: 'qc', at: '2026-10-09T10:00:00Z' }] },
    { _id: '100000000000000000000003', orderId: '200000000000000000000003', storeId: 'user_demo_maker',
        items: [{ productId: 'demo-clips', name: 'Desk cable clips', qty: 10, price: 3, productType: 'print' }],
        fulfilment: 'fit', status: 'paid', createdAt: '2026-10-09T10:00:00Z', statusHistory: [{ status: 'paid', at: '2026-10-09T10:00:00Z' }] },
];
export const manualPrinters = [
    { _id: 'manual-x1c-01', storeId: 'user_demo_maker', name: 'X1C-01', model: 'X1C', nozzleMm: 0.4, mode: 'mock', status: 'printing' },
    { _id: 'manual-p1s-01', storeId: 'user_demo_maker', name: 'P1S-01', model: 'P1S', nozzleMm: 0.4, mode: 'mock', status: 'idle' },
    { _id: 'manual-a1-01', storeId: 'user_demo_maker', name: 'A1-01', model: 'A1', nozzleMm: 0.4, mode: 'mock', status: 'paused' },
    { _id: 'mock-mini-01', storeId: 'user_demo_maker', name: 'A1 Mini-01', model: 'A1 Mini', nozzleMm: 0.4, mode: 'mock', status: 'error' },
    { _id: 'mock-mk4-01', storeId: 'user_demo_maker', name: 'MK4-01', model: 'MK4', nozzleMm: 0.4, mode: 'mock', status: 'offline' },
    { _id: 'studio-prusa-01', storeId: 'user_demo_studio', name: 'Studio MK4S', model: 'MK4S', nozzleMm: 0.4, mode: 'prusalink' },
    { _id: 'studio-bambu-01', storeId: 'user_demo_studio', name: 'Studio P1S', model: 'P1S', nozzleMm: 0.4, mode: 'bambu_lan' },
];
export const fixtureJobs = [
    { _id: '300000000000000000000001', storeId: 'user_demo_maker', source: { type: 'creator', refId: fixtureOrders[0]._id },
        name: 'Dragon keychain', qty: 4, materialSku: 'PLA Matte Red', priority: 2, position: 0, dueAt: '2026-10-12T04:00:00Z', estMinutes: 130, printerId: 'manual-p1s-01', status: 'assigned' },
    { _id: '300000000000000000000002', storeId: 'user_demo_studio', source: { type: 'creator', refId: fixtureOrders[1]._id },
        name: 'Ribbed planter', qty: 2, materialSku: 'PLA Silk Gold', priority: 1, position: 1, dueAt: '2026-10-13T04:00:00Z', estMinutes: 250, status: 'qc' },
    { _id: '300000000000000000000003', storeId: 'user_demo_maker', source: { type: 'creator', refId: fixtureOrders[2]._id },
        name: 'Desk cable clips', qty: 10, materialSku: 'PLA Basic Grey', priority: 0, position: 2, dueAt: '2026-10-14T04:00:00Z', estMinutes: 90, status: 'queued' },
];
