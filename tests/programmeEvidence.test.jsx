import { render, screen, cleanup, within } from '@testing-library/react'
import { existsSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
// Plain DOM image isolates content assertions from Next image optimisation.
// eslint-disable-next-line @next/next/no-img-element
vi.mock('next/image', () => ({ default: props => <img {...props} alt={props.alt} /> }))
import SchoolCollaborations from '../components/Programmes/SchoolCollaborations'
import LearningOutcomes from '../components/Programmes/LearningOutcomes'
import PenProgramme from '../components/Programmes/PenProgramme'
import SchoolProgrammes from '../app/school-programmes/page'
import CompanyWorkshops from '../app/company-workshops/page'
afterEach(cleanup)
it('represents all three schools, distinguishes the Bartley brief and avoids student images', () => {
  render(<SchoolCollaborations />)
  expect(screen.getByRole('heading', {name:'Bartley Secondary School'})).toBeInTheDocument()
  expect(screen.getByRole('heading', {name:'Boon Lay Garden Primary School'})).toBeInTheDocument()
  expect(screen.getByText(/Project planning example/)).toBeInTheDocument()
  expect(screen.getByRole('img').getAttribute('src')).toBe('/images/programmes/nygh-miniature-room-finished.jpg')
  expect(screen.getByText('A finished miniature room from the NYGH project.')).toBeInTheDocument()
  expect(screen.getByRole('link', {name:/Discuss a primary/})).toHaveAttribute('href', '#enquire')
})
it('offers 3D pen programmes to schools, teams and community groups with an enquiry path', () => {
  render(<PenProgramme />)
  expect(screen.getByText('SCHOOLS')).toBeInTheDocument()
  expect(screen.getByText('COMPANY TEAMS')).toBeInTheDocument()
  expect(screen.getByText('COMMUNITY GROUPS')).toBeInTheDocument()
  expect(screen.getByRole('link', {name:/Plan a 3D pen programme/})).toHaveAttribute('href','#enquire')
})
it('keeps the approved finished-project photographs attributed to EEEAA on both programme pages', () => {
  for (const Page of [SchoolProgrammes, CompanyWorkshops]) {
    const view=render(<Page />)
    const section=screen.getByRole('heading',{name:/Draw the pieces/}).closest('section')
    const image=within(section).getByRole('img')
    expect(image.getAttribute('src')).toMatch(/^\/images\/programmes\/eeeaa-2026-3d-pen-(?:balloon|phone-stand)\.jpg$/)
    expect(existsSync('public'+image.getAttribute('src'))).toBe(true)
    expect(within(section).getByText(/EEEAA 30th Anniversary workshop, 26 September 2026/)).toBeInTheDocument()
    expect(section.textContent).not.toMatch(/Bartley|Boon Lay|NYGH/)
    expect(screen.getAllByText(/EEEAA 30th Anniversary workshop, 26 September 2026/).length).toBeGreaterThanOrEqual(3)
    view.unmount()
  }
})
it('labels learning outcomes as programme goals with reviewable evidence', () => {
  render(<LearningOutcomes />)
  expect(screen.getByText(/These are programme goals/)).toBeInTheDocument()
  expect(screen.getByText('A short explanation of what changed')).toBeInTheDocument()
  expect(screen.getByRole('link')).toHaveAttribute('href', '#enquire')
})
it('adds existing non-identifying photographs to reading cards while preserving their destinations', () => {
  render(<SchoolProgrammes />)
  const reading=screen.getByRole('heading',{name:'Further reading'}).closest('section')
  const links=within(reading).getAllByRole('link')
  expect(links.map(link=>link.getAttribute('href'))).toEqual(['/blog/3d-printing','/blog/tinkercad-toolbox-guide','/blog/3d-printing-theory-and-material-properties','/blog/arduino-nano-io-expansion-shield-wiring'])
  for(const link of links){
    const image=within(link).getByRole('img')
    expect(image.getAttribute('src')).toMatch(/(?:nygh-miniature-room-finished|escape-room-button-lights)\.jpg$/)
    expect(existsSync('public'+image.getAttribute('src'))).toBe(true)
    expect(image.getAttribute('alt')).toBeTruthy()
  }
  expect(screen.getAllByText('A button panel that responds with light.').length).toBeGreaterThan(0)
  expect(screen.getAllByText('A finished miniature room from the NYGH project.').length).toBeGreaterThan(0)
})
it('leads with a finished creation and keeps wiring and component closeups in the lower gallery', () => {
  render(<SchoolProgrammes />)
  const hero = document.querySelector('article > header')
  expect(within(hero).getByRole('img')).toHaveAttribute('src','/images/programmes/eeeaa-2026-3d-pen-balloon.jpg')
  expect(within(hero).getByText(/EEEAA 30th Anniversary workshop/)).toBeInTheDocument()
  expect(within(hero).queryByText(/NYGH|Bartley|Boon Lay/)).not.toBeInTheDocument()
  const technicalImages = screen.getAllByRole('img').filter(image => /sensor-wiring|escape-room-electronics|nygh-printed-mechanism|miniature-escape-room-finished/.test(image.getAttribute('src')))
  expect(technicalImages.length).toBeGreaterThan(0)
  for(const image of technicalImages) expect(image.closest('#gallery')).not.toBeNull()
  expect(within(document.querySelector('#gallery')).getAllByRole('img')[0]).toHaveAttribute('src','/images/programmes/eeeaa-2026-3d-pen-balloon.jpg')
})
