// RTL smoke for the admin print-time calibration panel: renders samples from
// the API, offers apply when a fit exists, and posts uploads/updates.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/components/General/ToastProvider', () => ({
    useToast: () => ({ showToast: vi.fn() }),
}))

import PrintTimeCalibration from '@/components/Admin/PrintTimeCalibration'

const view = (overrides = {}) => ({
    samples: [
        {
            id: 's1',
            label: 'flat plate',
            fileName: 'plate.stl',
            settings: { layerHeightMm: 0.2, infillPercent: 20, wallLoops: 2, enableSupport: false },
            actualHours: 1.5,
            estimatedHours: 1.2,
        },
        {
            id: 's2',
            label: 'tall tower',
            fileName: 'tower.stl',
            settings: { layerHeightMm: 0.2, infillPercent: 20, wallLoops: 2, enableSupport: false },
            actualHours: null,
            estimatedHours: 3.4,
        },
    ],
    timedCount: 1,
    fit: null,
    applied: null,
    ...overrides,
})

describe('PrintTimeCalibration', () => {
    beforeEach(() => {
        global.fetch = vi.fn(() =>
            Promise.resolve({ ok: true, json: () => Promise.resolve(view()) }),
        )
    })
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('lists samples as a ledger with estimates, status and shape-diversity guidance', async () => {
        render(<PrintTimeCalibration />)
        expect(await screen.findByText('flat plate')).toBeInTheDocument()
        expect(screen.getByText('tall tower')).toBeInTheDocument()
        expect(screen.getByText('1h 12m')).toBeInTheDocument()
        expect(screen.getByText('3h 24m')).toBeInTheDocument()
        // Ledger status pills: the timed sample vs the one still waiting.
        expect(screen.getByText('Timed')).toBeInTheDocument()
        expect(screen.getByText('Awaiting time')).toBeInTheDocument()
        // One timed print → nudge for a second, differently-shaped one.
        expect(screen.getByText(/add a second, differently-shaped one/)).toBeInTheDocument()
        expect(screen.queryByText('Apply calibration')).toBeNull()
    })

    it('keeps the copy free of em dashes and middots', async () => {
        render(<PrintTimeCalibration />)
        await screen.findByText('flat plate')
        expect(document.body.textContent).not.toMatch(/[—·]/)
    })

    it('offers one-click apply when a fit exists and PUTs the apply action', async () => {
        const fitted = view({
            timedCount: 2,
            fit: {
                flowMm3PerS: 8,
                perLayerOverheadS: 4,
                samplesUsed: 2,
                currentMeanAbsPctError: 24,
                fittedMeanAbsPctError: 3,
            },
        })
        global.fetch = vi.fn((url, opts) =>
            Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve(
                        opts?.method === 'PUT' ? { ...fitted, applied: { flowMm3PerS: 8, perLayerOverheadS: 4, fittedAt: null } } : fitted,
                    ),
            }),
        )
        render(<PrintTimeCalibration />)
        // "off by 24% … drops to 3%" spans multiple elements — match the pieces.
        expect(await screen.findByText('24%')).toBeInTheDocument()
        expect(screen.getByText('3%')).toBeInTheDocument()
        fireEvent.click(screen.getByText('Apply calibration'))
        await waitFor(() => expect(screen.getByText(/Calibration applied/)).toBeInTheDocument())
        const putCall = global.fetch.mock.calls.find(([, opts]) => opts?.method === 'PUT')
        expect(JSON.parse(putCall[1].body)).toEqual({ action: 'apply' })
    })

    // The admin must be able to see what calibration did to real prices without
    // anyone running a script for them.
    describe('effect on quotes', () => {
        const withImpact = (impact) =>
            view({
                impact: {
                    total: 12,
                    shapeAwarePriced: 9,
                    heuristicPriced: 3,
                    comparable: 9,
                    medianRatio: 0.7,
                    movers: [],
                    ...impact,
                },
            })

        const renderWith = (data) => {
            global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(data) }))
            render(<PrintTimeCalibration />)
        }

        it('reports how many quotes each model priced, and the typical shift', async () => {
            renderWith(withImpact({}))

            expect(await screen.findByText('Effect on your quotes')).toBeInTheDocument()
            // The sentence spans several elements, so match on the paragraph.
            const sentence = screen.getByText(
                (_, el) => el?.tagName === 'P' && /Of the last 12 quotes/.test(el.textContent),
            )
            expect(sentence.textContent).toMatch(/9\s*priced from the shape/)
            expect(sentence.textContent).toMatch(/3\s*from the rough volume/)
            expect(screen.getByText('30% shorter')).toBeInTheDocument()
        })

        it('says "longer" when calibration pushed times up', async () => {
            renderWith(withImpact({ medianRatio: 1.45 }))

            expect(await screen.findByText('45% longer')).toBeInTheDocument()
        })

        it('lists the quotes calibration moved most', async () => {
            renderWith(
                withImpact({
                    movers: [
                        {
                            requestId: 'r1',
                            total: 42.5,
                            currency: 'sgd',
                            printHoursHeuristic: 3.3,
                            printHoursShapeAware: 8.1,
                            ratio: 2.45,
                        },
                    ],
                }),
            )

            expect(await screen.findByText('3.3 h to 8.1 h')).toBeInTheDocument()
            expect(screen.getByText('SGD 42.50')).toBeInTheDocument()
        })

        it('shows nothing at all before there are quotes to compare', async () => {
            renderWith(withImpact({ total: 0, shapeAwarePriced: 0, heuristicPriced: 0, comparable: 0 }))

            await screen.findByText(/Your test prints/)
            expect(screen.queryByText('Effect on your quotes')).toBeNull()
        })
    })
})
