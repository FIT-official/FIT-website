import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ServicePage from '@/components/Services/ServicePage'
import { researchServices } from '@/lib/content/researchServices'

afterEach(cleanup)

it('carries the modelling brief into the email without submitting a request', () => {
    render(<ServicePage page={researchServices.design} />)
    const draft = new URL(screen.getByRole('link', { name: 'Email FIT' }).href)
    expect(draft.protocol).toBe('mailto:')
    expect(draft.searchParams.get('subject')).toBe('3D design and printing enquiry')
    const body = draft.searchParams.get('body')
    for (const detail of ['Dimensions', 'Quantity', 'Preferred material', 'Required date', 'ownership / usage-rights', 'Sketches / photos / CAD files']) expect(body).toContain(detail)
    expect(screen.getByRole('link', { name: /Start a print request/ })).toHaveAttribute('href', '/prints/request')
    expect(screen.getByRole('link', { name: 'Request a quote' })).toHaveAttribute('href', '#enquire')
})
