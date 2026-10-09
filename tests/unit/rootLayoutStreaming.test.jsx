// @vitest-environment node
import React from 'react'
import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/font/google', () => ({ Inter: () => ({ variable: 'inter' }) }))
vi.mock('@clerk/nextjs', () => ({ ClerkProvider: ({ children }) => children }))
vi.mock('@/components/General/Navbar', () => ({ default: () => <nav>Navigation</nav> }))
vi.mock('@/components/General/Footer', () => ({ default: () => <footer>Footer</footer> }))
vi.mock('@/components/Chat/ChatLauncher', () => ({ default: () => null }))
vi.mock('@/components/General/Smooth', () => ({ default: ({ children }) => children }))
vi.mock('@/components/General/ToastProvider', () => ({ ToastProvider: ({ children }) => children }))
vi.mock('@/components/General/CurrencyContext', () => ({ CurrencyProvider: ({ children }) => children }))
vi.mock('@/components/General/ClientProviders', () => ({ default: ({ children }) => children }))
vi.mock('@/components/General/PostHogProvider', () => ({ default: ({ children }) => children }))
vi.mock('@/components/General/AnalyticsConsentProvider', () => ({ default: ({ children }) => children }))
vi.mock('@/components/General/GoogleMeasurementProvider', () => ({ default: ({ children }) => children }))
vi.mock('@/components/Workshop/PresentationBoundary', () => ({ default: ({ children }) => children }))

import RootLayout from '@/app/layout'

describe('route checks before the HTTP shell', () => {
    it.each([true, false])('waits for a delayed existence decision (exists=%s)', async exists => {
        let release
        let settled = false
        const pending = new Promise(resolve => { release = () => { settled = true; resolve() } })
        const missing = new Error('NEXT_HTTP_ERROR_FALLBACK;404')
        function Route() {
            if (!settled) throw pending
            if (!exists) throw missing
            return <main>Available page</main>
        }
        const shellReady = vi.fn()
        const shellError = vi.fn()
        const output = new PassThrough()
        let html = ''
        output.on('data', chunk => { html += chunk })
        let finish
        const done = new Promise(resolve => { finish = resolve })
        const stream = renderToPipeableStream(<RootLayout><Route /></RootLayout>, {
            onShellReady() { shellReady(); stream.pipe(output) },
            onShellError(error) { shellError(error); finish() },
            onError() {},
        })
        output.on('end', finish)
        try {
            await new Promise(resolve => setImmediate(resolve))
            expect(shellReady).not.toHaveBeenCalled()
            expect(html).toBe('')
            release()
            await done
            if (exists) {
                expect(shellReady).toHaveBeenCalledOnce()
                expect(html).toContain('Available page')
                expect(shellError).not.toHaveBeenCalled()
            } else {
                expect(shellReady).not.toHaveBeenCalled()
                expect(shellError).toHaveBeenCalledWith(missing)
                expect(html).toBe('')
            }
        } finally {
            stream.abort()
            output.destroy()
        }
    })
})
