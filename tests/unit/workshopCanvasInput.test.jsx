import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import GroupCanvas from '@/components/Workshop/GroupCanvas'
import { blankCanvas, validCanvas } from '@/lib/workshopCanvasModel'
import { WORKSHOP_SESSION } from '@/lib/workshopFeedback'

vi.mock('@/components/Workshop/CanvasImageImport', () => ({ default: () => null }))
vi.mock('@/components/Workshop/CanvasImageDownload', () => ({ default: () => null }))
vi.mock('@/components/Workshop/CanvasGuidance', () => ({ default: () => null }))

const seat = 'guest_11111111-1111-4111-8111-111111111111'
const lesson = { seat, group: 'g2', refinementOpen: true }
const localKey = 'fit:canvas:' + WORKSHOP_SESSION + ':' + seat + ':g2:1'

// jsdom has no SVG layout or native pointer capture. Keep those browser
// primitives deterministic while exercising the actual drawing and draft code.
class TestPointerEvent extends MouseEvent {
    constructor(type, options = {}) {
        super(type, { bubbles: true, cancelable: true, ...options })
        for (const [key, value] of Object.entries({ pointerId: 1, pointerType: 'mouse', isPrimary: true, pressure: .5, width: 1, height: 1 })) Object.defineProperty(this, key, { value: options[key] ?? value })
    }
    getCoalescedEvents() { return [] }
}
class TestDOMPoint {
    constructor(x, y) { this.x = x; this.y = y }
    matrixTransform(matrix) { return new TestDOMPoint(this.x * matrix.a + this.y * matrix.c + matrix.e, this.x * matrix.b + this.y * matrix.d + matrix.f) }
}

beforeEach(() => { localStorage.clear(); vi.stubGlobal('PointerEvent', TestPointerEvent); vi.stubGlobal('DOMPoint', TestDOMPoint) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

async function drawing() {
    let version = 0
    const saved = []
    const request = vi.fn(async payload => {
        if (!payload) return { seat, document: blankCanvas(), version, status: 'draft', history: [] }
        saved.push(structuredClone(payload)); version++
        return { seat, document: structuredClone(payload.document), version, ackVersion: version, saved: true, requestId: payload.requestId, status: 'draft', history: [] }
    })
    render(<GroupCanvas lesson={lesson} idea="1" request={request} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled())
    const board = screen.getByTestId('drawing-board'), captured = new Set()
    // CSS board is half the model's dimensions and offset in the viewport.
    Object.defineProperties(board, {
        getBoundingClientRect: { configurable: true, value: () => ({ x: 40, y: 60, left: 40, top: 60, right: 840, bottom: 560, width: 800, height: 500 }) },
        getScreenCTM: { configurable: true, value: () => ({ inverse: () => ({ a: 2, b: 0, c: 0, d: 2, e: -80, f: -120 }) }) },
        setPointerCapture: { configurable: true, value: vi.fn(id => captured.add(id)) },
        hasPointerCapture: { configurable: true, value: id => captured.has(id) },
        releasePointerCapture: { configurable: true, value: vi.fn(id => captured.delete(id)) },
    })
    const pointer = (type, id, kind, x, y, extras = {}) => {
        const { target = board, ...options } = extras
        const event = new TestPointerEvent(type, { pointerId: id, pointerType: kind, clientX: 40 + x / 2, clientY: 60 + y / 2, button: 0, buttons: type === 'pointerup' ? 0 : 1, ...options })
        if (type === 'lostpointercapture') captured.delete(id)
        fireEvent(target, event)
        return event
    }
    const stroke = (id, kind, points) => {
        pointer('pointerdown', id, kind, ...points[0])
        for (const point of points.slice(1)) pointer('pointermove', id, kind, ...point)
        pointer('pointerup', id, kind, ...points.at(-1))
    }
    const device = () => JSON.parse(localStorage.getItem(localKey)).document
    const save = async () => {
        const before = saved.length
        fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
        await waitFor(() => expect(saved.length).toBeGreaterThan(before))
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved to class'))
        expect(saved.at(-1)).toMatchObject({ action: 'draft', expectedSeat: seat })
        expect(validCanvas(saved.at(-1).document)).toBe(true)
        return saved.at(-1).document
    }
    return { board, captured, request, saved, pointer, stroke, device, save }
}

const absolutePoints = object => object.points.map(([x, y]) => [object.x + object.w * x, object.y + object.h * y])

describe('canvas pointer input and durable drawing', () => {
    it('draws a finger stroke in board coordinates and saves it to device and class', async () => {
        const canvas = await drawing(), points = [[100, 120], [200, 220], [300, 320]]
        const down = canvas.pointer('pointerdown', 1, 'touch', ...points[0])
        expect(down.defaultPrevented).toBe(true)
        canvas.pointer('pointermove', 1, 'touch', ...points[1]); canvas.pointer('pointermove', 1, 'touch', ...points[2]); canvas.pointer('pointerup', 1, 'touch', ...points[2])
        expect(canvas.device().objects).toHaveLength(1); expect(absolutePoints(canvas.device().objects[0])).toEqual(points)
        expect(canvas.board.querySelector('[data-object-id]').getAttribute('d')).toBe('M100,120 L200,220 L300,320')
        expect((await canvas.save()).objects).toEqual(canvas.device().objects)
        expect(canvas.captured.size).toBe(0)
    })
    it('gives the pen priority when a palm touches first, without zooming or keeping the palm mark', async () => {
        const canvas = await drawing(), beforeView = canvas.board.getAttribute('viewBox')
        canvas.pointer('pointerdown', 1, 'touch', 700, 600, { width: 60, height: 50 })
        canvas.pointer('pointerdown', 2, 'pen', 100, 100)
        canvas.pointer('pointermove', 2, 'pen', 200, 200)
        canvas.pointer('pointermove', 1, 'touch', 900, 700, { width: 60, height: 50 })
        canvas.pointer('pointerup', 1, 'touch', 900, 700)
        canvas.pointer('pointermove', 2, 'pen', 300, 300)
        canvas.pointer('pointerup', 2, 'pen', 300, 300)
        expect(canvas.device().objects).toHaveLength(1)
        expect(absolutePoints(canvas.device().objects[0])).toEqual([[100, 100], [200, 200], [300, 300]])
        expect(canvas.board.getAttribute('viewBox')).toBe(beforeView)
        expect((await canvas.save()).objects).toEqual(canvas.device().objects)
        fireEvent.click(screen.getByRole('button', { name: 'Undo' })); expect(canvas.device().objects).toHaveLength(0)
    })
    it('ignores a palm landing during an active pen stroke', async () => {
        const canvas = await drawing()
        canvas.pointer('pointerdown', 2, 'pen', 100, 100)
        canvas.pointer('pointerdown', 3, 'touch', 1000, 800, { width: 70, height: 50 })
        canvas.pointer('pointermove', 2, 'pen', 200, 200)
        canvas.pointer('pointerup', 3, 'touch', 1100, 850)
        canvas.pointer('pointermove', 2, 'pen', 300, 300)
        canvas.pointer('pointerup', 2, 'pen', 300, 300)
        const doc = await canvas.save()
        expect(doc.objects).toHaveLength(1); expect(absolutePoints(doc.objects[0])).toEqual([[100, 100], [200, 200], [300, 300]])
    })
    it('includes the final pen-up position when the browser omits a last move sample', async () => {
        const canvas = await drawing()
        canvas.pointer('pointerdown', 1, 'pen', 100, 100)
        canvas.pointer('pointermove', 1, 'pen', 200, 200)
        canvas.pointer('pointerup', 1, 'pen', 300, 300)
        expect(absolutePoints((await canvas.save()).objects[0])).toEqual([[100, 100], [200, 200], [300, 300]])
    })
    it.each(['pointercancel', 'lostpointercapture'])('can draw and save again after a pen %s', async interrupted => {
        const canvas = await drawing()
        canvas.pointer('pointerdown', 7, 'pen', 50, 50)
        canvas.pointer('pointermove', 7, 'pen', 100, 100)
        canvas.pointer(interrupted, 7, 'pen', 100, 100)
        const completed = canvas.device().objects.length
        const beforeLateUp = JSON.parse(localStorage.getItem(localKey)).undo.length
        canvas.pointer('pointerup', 7, 'pen', 100, 100)
        expect(JSON.parse(localStorage.getItem(localKey)).undo).toHaveLength(beforeLateUp)
        canvas.stroke(8, 'touch', [[400, 400], [500, 500], [600, 600]])
        expect(canvas.device().objects).toHaveLength(completed + 1)
        const doc = await canvas.save()
        expect(absolutePoints(doc.objects.at(-1))).toEqual([[400, 400], [500, 500], [600, 600]])
        expect(canvas.captured.size).toBe(0)
        fireEvent.click(screen.getByRole('button', { name: 'Undo' })); expect(canvas.device().objects).toHaveLength(completed)
    })
    it('pinches with two fingers without leaving a stroke, then draws normally with one finger', async () => {
        const canvas = await drawing(), beforeView = canvas.board.getAttribute('viewBox')
        canvas.pointer('pointerdown', 1, 'touch', 300, 300)
        canvas.pointer('pointerdown', 2, 'touch', 700, 300, { isPrimary: false })
        canvas.pointer('pointermove', 2, 'touch', 1000, 300, { isPrimary: false })
        expect(canvas.board.getAttribute('viewBox')).not.toBe(beforeView)
        canvas.pointer('pointerup', 2, 'touch', 1000, 300, { isPrimary: false })
        canvas.pointer('pointermove', 1, 'touch', 350, 350)
        canvas.pointer('pointerup', 1, 'touch', 350, 350)
        expect(canvas.device().objects).toHaveLength(0)
        expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
        fireEvent.click(screen.getByRole('button', { name: 'Fit / reset view' }))
        canvas.stroke(3, 'touch', [[100, 100], [200, 200], [300, 300]])
        expect((await canvas.save()).objects).toHaveLength(1)
    })
    it('ignores a third contact without ending an existing two-finger pinch', async () => {
        const canvas = await drawing()
        canvas.pointer('pointerdown', 1, 'touch', 300, 300)
        canvas.pointer('pointerdown', 2, 'touch', 700, 300, { isPrimary: false })
        canvas.pointer('pointerdown', 3, 'touch', 900, 700, { isPrimary: false })
        canvas.pointer('pointerup', 3, 'touch', 900, 700, { isPrimary: false })
        const beforeMove = canvas.board.getAttribute('viewBox')
        canvas.pointer('pointermove', 2, 'touch', 1000, 300, { isPrimary: false })
        expect(canvas.board.getAttribute('viewBox')).not.toBe(beforeMove)
        canvas.pointer('pointerup', 2, 'touch', 1000, 300, { isPrimary: false }); canvas.pointer('pointerup', 1, 'touch', 300, 300)
        expect(canvas.device().objects).toHaveLength(0)
        expect(canvas.captured.size).toBe(0)
    })
    it('keeps mouse drawing, undo and redo as complete saved gestures', async () => {
        const canvas = await drawing(), points = [[120, 100], [220, 200], [320, 300]]
        canvas.stroke(1, 'mouse', points)
        expect(absolutePoints((await canvas.save()).objects[0])).toEqual(points)
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
        expect(canvas.device().objects).toHaveLength(0); expect(canvas.board.querySelector('[data-object-id]')).toBeNull()
        expect((await canvas.save()).objects).toHaveLength(0)
        fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
        expect(absolutePoints(canvas.device().objects[0])).toEqual(points)
        expect((await canvas.save()).objects).toHaveLength(1)
    })
    it('continues drawing when SVG pointer capture is unavailable', async () => {
        const canvas = await drawing()
        canvas.board.setPointerCapture.mockImplementation(() => { throw new DOMException('Pointer capture unavailable', 'NotFoundError') })
        canvas.stroke(1, 'touch', [[100, 100], [200, 200], [300, 300]])
        const doc = await canvas.save()
        expect(doc.objects).toHaveLength(1)
        expect(absolutePoints(doc.objects[0])).toEqual([[100, 100], [200, 200], [300, 300]])
        expect(canvas.captured.size).toBe(0)
    })
    it('finishes a stroke released outside the board when pointer capture fails', async () => {
        const canvas = await drawing()
        canvas.board.setPointerCapture.mockImplementation(() => { throw new DOMException('Pointer capture unavailable', 'NotFoundError') })
        canvas.pointer('pointerdown', 1, 'touch', 100, 100)
        canvas.pointer('pointerup', 1, 'touch', 1800, 300, { target: window })
        const doc = await canvas.save()
        expect(absolutePoints(doc.objects[0])).toEqual([[100, 100], [1599, 300]])
        expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
        canvas.stroke(2, 'touch', [[300, 400], [400, 500]])
        expect(canvas.device().objects).toHaveLength(2)
    })
    it('creates, moves and resizes a shape with a finger while preserving one object', async () => {
        const canvas = await drawing()
        fireEvent.click(screen.getByRole('button', { name: 'Shapes' }))
        canvas.stroke(1, 'touch', [[100, 100], [300, 250]])
        const objectId = canvas.device().objects[0].id
        expect(canvas.device().objects[0]).toMatchObject({ type: 'rect', x: 100, y: 100, w: 200, h: 150 })
        fireEvent.click(screen.getByRole('button', { name: 'Select', exact: true }))
        canvas.pointer('pointerdown', 2, 'touch', 150, 150, { target: canvas.board.querySelector('[data-object-id]') })
        canvas.pointer('pointermove', 2, 'touch', 200, 200)
        canvas.pointer('pointerup', 2, 'touch', 200, 200)
        expect(canvas.device().objects[0]).toMatchObject({ id: objectId, x: 150, y: 150, w: 200, h: 150 })
        canvas.pointer('pointerdown', 3, 'touch', 350, 300, { target: canvas.board.querySelector('[data-resize]') })
        canvas.pointer('pointermove', 3, 'touch', 450, 350)
        canvas.pointer('pointerup', 3, 'touch', 450, 350)
        const doc = await canvas.save()
        expect(doc.objects).toHaveLength(1); expect(doc.objects[0]).toMatchObject({ id: objectId, x: 150, y: 150, w: 300, h: 200 })
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
        expect(canvas.device().objects[0]).toMatchObject({ id: objectId, x: 150, y: 150, w: 200, h: 150 })
    })
    it('ignores a pointer while SVG layout is unavailable and accepts a clean retry', async () => {
        const canvas = await drawing(), geometry = canvas.board.getScreenCTM
        Object.defineProperty(canvas.board, 'getScreenCTM', { configurable: true, value: () => null })
        canvas.stroke(1, 'touch', [[100, 100], [200, 200]])
        expect(canvas.device().objects).toHaveLength(0); expect(canvas.captured.size).toBe(0)
        Object.defineProperty(canvas.board, 'getScreenCTM', { configurable: true, value: geometry })
        canvas.stroke(2, 'touch', [[300, 300], [400, 400]])
        expect(absolutePoints((await canvas.save()).objects[0])).toEqual([[300, 300], [400, 400]])
    })
    it('uses native SVG coordinates to draw when DOMPoint is unavailable', async () => {
        const canvas = await drawing()
        vi.stubGlobal('DOMPoint', undefined)
        Object.defineProperty(canvas.board, 'createSVGPoint', { configurable: true, value: () => new TestDOMPoint(0, 0) })
        canvas.stroke(1, 'pen', [[100, 100], [300, 300]])
        expect(absolutePoints((await canvas.save()).objects[0])).toEqual([[100, 100], [300, 300]])
    })
})
