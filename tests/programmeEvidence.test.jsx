import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
// Plain DOM image isolates content assertions from Next image optimisation.
// eslint-disable-next-line @next/next/no-img-element
vi.mock('next/image', () => ({ default: props => <img {...props} alt={props.alt} /> }))
import SchoolCollaborations from '../components/Programmes/SchoolCollaborations'
import LearningOutcomes from '../components/Programmes/LearningOutcomes'
import PenProgramme from '../components/Programmes/PenProgramme'
afterEach(cleanup)
it('represents all three schools, distinguishes the Bartley brief and avoids student images', () => {
  render(<SchoolCollaborations />)
  expect(screen.getByRole('heading', {name:'Bartley Secondary School'})).toBeInTheDocument()
  expect(screen.getByRole('heading', {name:'Boon Lay Garden Primary School'})).toBeInTheDocument()
  expect(screen.getByText(/Project planning example/)).toBeInTheDocument()
  expect(screen.getByRole('img').getAttribute('src')).toBe('/images/collaborations/nygh-room-models.jpg')
  expect(screen.getByRole('link', {name:/Discuss a primary/})).toHaveAttribute('href', '#enquire')
})
it('offers 3D pen programmes to schools, teams and community groups with an enquiry path', () => {
  render(<PenProgramme />)
  expect(screen.getByText('SCHOOLS')).toBeInTheDocument()
  expect(screen.getByText('COMPANY TEAMS')).toBeInTheDocument()
  expect(screen.getByText('COMMUNITY GROUPS')).toBeInTheDocument()
  expect(screen.getByRole('link', {name:/Plan a 3D pen programme/})).toHaveAttribute('href','#enquire')
})
it('labels learning outcomes as programme goals with reviewable evidence', () => {
  render(<LearningOutcomes />)
  expect(screen.getByText(/These are programme goals/)).toBeInTheDocument()
  expect(screen.getByText('A test record and a reasoned revision')).toBeInTheDocument()
  expect(screen.getByRole('link')).toHaveAttribute('href', '#enquire')
})
