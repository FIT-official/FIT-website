import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import BulkFilamentRequests from '@/components/Admin/BulkFilamentRequests'
import { parseBulkInput, saveBulkRequest } from '@/lib/bulkFilament'
import { bulkOwnerMessage } from '@/lib/bulkFilamentEmail'
import { fixtureCatalogue, fixtureInput, fixtureLine, memoryStore } from '../fixtures/bulkFilament'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each(['Marble', 'Wood Colour'])('preserves the 3 %s + 7 plain PLA quote through storage, owner email and admin display', async colour => {
  const catalogue = fixtureCatalogue(), input = fixtureInput(catalogue), store = memoryStore()
  input.lines = [fixtureLine(catalogue, 'Lanbo', 'PLA', colour, 3), fixtureLine(catalogue, 'Lanbo', 'PLA', 'Black', 7)]
  await saveBulkRequest(store, parseBulkInput(input), async () => catalogue)
  const doc = store.docs.get(input.clientRequestId)
  expect(doc.totalCents).toBe(15400)
  expect(doc.lines.find(line => line.colour === colour)).toMatchObject({ ladder: 'SPECIALTY_PLA', quantity: 3, band: '10–19', tierRolls: 10, unitCents: 1890, lineCents: 5670 })
  expect(doc.lines.find(line => line.colour === 'Black')).toMatchObject({ ladder: 'PLA', quantity: 7, band: '10–19', tierRolls: 10, unitCents: 1390, lineCents: 9730 })
  const message = bulkOwnerMessage(doc)
  for (const text of ['10 PLA rolls combined', 'SGD 18.90', 'SGD 56.70', 'SGD 13.90', 'SGD 97.30', 'Indicative filament total: SGD 154.00']) {
    expect(message.text).toContain(text)
    expect(message.html).toContain(text)
  }
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ requests: [doc], next: null }) })))
  render(<BulkFilamentRequests />)
  const article = await screen.findByRole('article')
  const premium = within(article).getAllByRole('listitem').find(item => item.textContent.includes('Colour: ' + colour))
  expect(premium).toHaveTextContent('PLA band 10–19 · 10 rolls combined')
  expect(premium).toHaveTextContent('Unit price: SGD 18.90 / roll')
  expect(premium).toHaveTextContent('Line total: SGD 56.70')
  expect(article).toHaveTextContent('Unit price: SGD 13.90 / roll')
  expect(article).toHaveTextContent('Line total: SGD 97.30')
  expect(article).toHaveTextContent('Indicative total: SGD 154.00')
})
