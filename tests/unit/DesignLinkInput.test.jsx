import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import DesignLinkInput from '@/components/Editor/DesignLinkInput'

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const input = (url = 'https://makerworld.com/en/models/123') => fireEvent.change(screen.getByLabelText('Paste a design link'), { target: { value: url } })
it('imports actual bytes and forwards source attribution', async () => {
  const imported = vi.fn()
  fetch.mockResolvedValue(new Response('solid part\nendsolid', { headers: { 'content-type': 'model/stl', 'X-Model-Filename': 'test%20part.stl', 'X-Model-Source-Url': 'https%3A%2F%2Fmakerworld.com%2Fen%2Fmodels%2F123', 'X-Model-Attribution': 'Example%20Designer' } }))
  render(<DesignLinkInput onImport={imported} />)
  input(); fireEvent.click(screen.getByText('Import design'))
  await waitFor(() => expect(imported).toHaveBeenCalledOnce())
  expect(imported.mock.calls[0][0].name).toBe('test part.stl')
  expect(imported.mock.calls[0][1].attribution).toBe('Example Designer')
})
it('asks the user which file to import instead of silently choosing the first', async () => {
  fetch.mockResolvedValue(new Response(JSON.stringify({ status: 'select_file', files: [{ url: 'https://files.example.com/part.stl', name: 'part.stl', format: 'stl' }] }), { headers: { 'content-type': 'application/json' } }))
  render(<DesignLinkInput onImport={vi.fn()} />)
  input(); fireEvent.click(screen.getByText('Import design'))
  fireEvent.click(await screen.findByText('part.stl'))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  expect(JSON.parse(fetch.mock.calls[1][1].body).selectionUrl).toBe('https://files.example.com/part.stl')
})
it('shows an actionable fallback for gated models and never calls import', async () => {
  const imported = vi.fn()
  fetch.mockResolvedValue(new Response(JSON.stringify({ status: 'upload_required', message: 'This site requires a login. Download the file and upload it below.' }), { status: 422, headers: { 'content-type': 'application/json' } }))
  render(<DesignLinkInput onImport={imported} />)
  input(); fireEvent.click(screen.getByText('Import design'))
  expect(await screen.findByText(/requires a login/)).toBeInTheDocument()
  expect(imported).not.toHaveBeenCalled()
})
it('rejects credential URLs before sending a request', async () => {
  render(<DesignLinkInput onImport={vi.fn()} />)
  input('https://user:pass@example.com/part.stl'); fireEvent.click(screen.getByText('Import design'))
  expect(await screen.findByText(/public HTTPS/)).toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})
it('does not claim import success when model parsing fails', async () => {
  fetch.mockResolvedValue(new Response('bad file', { headers: { 'content-type': 'model/stl' } }))
  render(<DesignLinkInput onImport={vi.fn().mockRejectedValue(new Error('No printable geometry'))} />)
  input(); fireEvent.click(screen.getByText('Import design'))
  expect(await screen.findByText('No printable geometry')).toBeInTheDocument()
})
