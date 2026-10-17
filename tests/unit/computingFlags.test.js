import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    const error = new Error('NEXT_HTTP_ERROR_FALLBACK;404')
    error.digest = 'NEXT_HTTP_ERROR_FALLBACK;404'
    throw error
  }),
}))

vi.mock('next/navigation', () => ({
  notFound: navigation.notFound,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }) =>
    React.createElement('a', { href, ...props }, children),
}))

vi.mock('@/components/sims/ActivityArt', () => ({
  default: () => React.createElement('div', {
    'data-testid': 'activity-art',
  }),
}))

import {
  COMPUTING_FLAG_NAMES,
  computingFlagNames,
  computingFlag,
} from '@/lib/computing/flags'

import ComputingPage, {
  metadata as computingMetadata,
} from '@/app/computing/page'

import ClassPage, {
  metadata as classMetadata,
} from '@/app/class/page'

const ALL_FLAGS = [
  'COMPUTING_ENABLED',
  'COMPUTING_BLOCKS_ENABLED',
  'COMPUTING_PYTHON_ENABLED',
  'COMPUTING_MATHS_ENABLED',
  'COMPUTING_SIGNALS_ENABLED',
  'COMPUTING_SQL_ENABLED',
]

function renderPage(Page) {
  return renderToStaticMarkup(React.createElement(Page))
}

function enableFlag(name) {
  vi.stubEnv(name, 'true')
}

function disableFlag(name) {
  vi.stubEnv(name, 'false')
}

beforeEach(() => {
  vi.unstubAllEnvs()
  navigation.notFound.mockClear()

  for (const name of ALL_FLAGS) {
    vi.stubEnv(name, '')
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('Computing feature flag contract', () => {
  it('exports the complete approved list of feature flags', () => {
    expect(COMPUTING_FLAG_NAMES).toEqual(ALL_FLAGS)
    expect(computingFlagNames).toEqual(ALL_FLAGS)
    expect(new Set(COMPUTING_FLAG_NAMES).size).toBe(ALL_FLAGS.length)
  })

  it('does not allow the exported flag list to be mutated', () => {
    expect(Object.isFrozen(COMPUTING_FLAG_NAMES)).toBe(true)
  })

  it.each(ALL_FLAGS)(
    '%s defaults to off when missing',
    (name) => {
      expect(computingFlag(name, {})).toBe(false)
    },
  )

  it.each(ALL_FLAGS)(
    '%s is enabled only by the exact string true',
    (name) => {
      expect(computingFlag(name, { [name]: 'true' })).toBe(true)

      for (const value of [
        '',
        'false',
        'TRUE',
        'True',
        '1',
        'yes',
        'on',
        ' true',
        'true ',
        true,
        1,
        null,
        undefined,
      ]) {
        expect(computingFlag(name, { [name]: value })).toBe(false)
      }
    },
  )

  it('rejects unknown flag names even if the environment enables them', () => {
    expect(
      computingFlag('UNKNOWN_FLAG', {
        UNKNOWN_FLAG: 'true',
      }),
    ).toBe(false)

    expect(
      computingFlag('COMPUTING_ADMIN_ENABLED', {
        COMPUTING_ADMIN_ENABLED: 'true',
      }),
    ).toBe(false)
  })

  it('rejects malformed names and environments safely', () => {
    expect(computingFlag(null, {})).toBe(false)
    expect(computingFlag(undefined, {})).toBe(false)
    expect(computingFlag(123, {})).toBe(false)
    expect(computingFlag('', {})).toBe(false)

    expect(computingFlag('COMPUTING_ENABLED', null)).toBe(false)
    expect(computingFlag('COMPUTING_ENABLED', undefined)).toBe(false)
    expect(computingFlag('COMPUTING_ENABLED', 'true')).toBe(false)
  })

  it('does not treat an inherited property as an enabled flag', () => {
    const env = Object.create({
      COMPUTING_ENABLED: 'true',
    })

    expect(computingFlag('COMPUTING_ENABLED', env)).toBe(false)
  })

  it('reads process.env by default', () => {
    disableFlag('COMPUTING_ENABLED')

    expect(computingFlag('COMPUTING_ENABLED')).toBe(false)

    enableFlag('COMPUTING_ENABLED')

    expect(computingFlag('COMPUTING_ENABLED')).toBe(true)
  })

  it('keeps each feature independently controlled', () => {
    const env = {
      COMPUTING_ENABLED: 'true',
      COMPUTING_BLOCKS_ENABLED: 'false',
      COMPUTING_PYTHON_ENABLED: 'true',
      COMPUTING_MATHS_ENABLED: '',
      COMPUTING_SIGNALS_ENABLED: 'false',
      COMPUTING_SQL_ENABLED: 'true',
    }

    expect(computingFlag('COMPUTING_ENABLED', env)).toBe(true)
    expect(computingFlag('COMPUTING_BLOCKS_ENABLED', env)).toBe(false)
    expect(computingFlag('COMPUTING_PYTHON_ENABLED', env)).toBe(true)
    expect(computingFlag('COMPUTING_MATHS_ENABLED', env)).toBe(false)
    expect(computingFlag('COMPUTING_SIGNALS_ENABLED', env)).toBe(false)
    expect(computingFlag('COMPUTING_SQL_ENABLED', env)).toBe(true)
  })
})

describe('/computing feature gating', () => {
  it('calls notFound when COMPUTING_ENABLED is off', () => {
    disableFlag('COMPUTING_ENABLED')

    expect(() => ComputingPage()).toThrow(
      'NEXT_HTTP_ERROR_FALLBACK;404',
    )

    expect(navigation.notFound).toHaveBeenCalledOnce()
  })

  it('calls notFound when COMPUTING_ENABLED is missing', () => {
    vi.stubEnv('COMPUTING_ENABLED', undefined)

    expect(() => ComputingPage()).toThrow(
      'NEXT_HTTP_ERROR_FALLBACK;404',
    )

    expect(navigation.notFound).toHaveBeenCalledOnce()
  })

  it('does not expose the hub when only Blocks is enabled', () => {
    disableFlag('COMPUTING_ENABLED')
    enableFlag('COMPUTING_BLOCKS_ENABLED')

    expect(() => ComputingPage()).toThrow(
      'NEXT_HTTP_ERROR_FALLBACK;404',
    )

    expect(navigation.notFound).toHaveBeenCalledOnce()
  })

  it('renders the Computing hub when enabled', () => {
    enableFlag('COMPUTING_ENABLED')

    const html = renderPage(ComputingPage)

    expect(navigation.notFound).not.toHaveBeenCalled()

    expect(html).toContain('Computing')
    expect(html).toContain(
      'Write and run code in your browser. Nothing to install.',
    )

    expect(html).toContain('href="/computing/code"')
    expect(html).toContain('Code Lab')
    expect(html).toContain('href="/class"')
    expect(html).toContain('aria-label="Breadcrumb"')
  })

  it('hides Blocks when COMPUTING_BLOCKS_ENABLED is off', () => {
    enableFlag('COMPUTING_ENABLED')
    disableFlag('COMPUTING_BLOCKS_ENABLED')

    const html = renderPage(ComputingPage)

    expect(html).not.toContain('href="/computing/blocks"')
    expect(html).not.toContain('id="blocks-heading"')
    expect(html).toContain('href="/computing/code"')
  })

  it('shows Blocks only when its feature flag is enabled', () => {
    enableFlag('COMPUTING_ENABLED')
    enableFlag('COMPUTING_BLOCKS_ENABLED')

    const html = renderPage(ComputingPage)

    expect(html).toContain('href="/computing/blocks"')
    expect(html).toContain('id="blocks-heading"')
    expect(html).toContain('Open Blocks')
    expect(html).toContain('href="/computing/code"')
  })

  it('does not expose other feature cards just because their flags are on', () => {
    enableFlag('COMPUTING_ENABLED')
    enableFlag('COMPUTING_PYTHON_ENABLED')
    enableFlag('COMPUTING_MATHS_ENABLED')
    enableFlag('COMPUTING_SIGNALS_ENABLED')
    enableFlag('COMPUTING_SQL_ENABLED')

    const html = renderPage(ComputingPage)

    expect(html).toContain('href="/computing/code"')
    expect(html).not.toContain('href="/computing/blocks"')
    expect(html).not.toContain('href="/computing/maths"')
    expect(html).not.toContain('href="/computing/signals"')
    expect(html).not.toContain('href="/computing/sql"')
  })

  it('has Computing metadata with its canonical path', () => {
    expect(computingMetadata.title).toBe(
      'Computing | FIT Learning Studio',
    )

    expect(computingMetadata.description).toBe(
      'Write and run code in your browser. Nothing to install.',
    )

    expect(computingMetadata.alternates.canonical).toContain(
      '/computing',
    )
  })

  it('uses a labelled, accessible tool section', () => {
    enableFlag('COMPUTING_ENABLED')

    const html = renderPage(ComputingPage)

    expect(html).toContain(
      'aria-labelledby="computing-tools-heading"',
    )

    expect(html).toContain(
      'aria-labelledby="code-lab-heading"',
    )

    expect(html).toContain(
      'aria-describedby="code-lab-description"',
    )
  })
})

describe('/class Computing card', () => {
  it('does not show a Computing card when the main flag is off', () => {
    disableFlag('COMPUTING_ENABLED')

    const html = renderPage(ClassPage)

    expect(html).toContain('Simulations')
    expect(html).toContain('href="/class/simulations"')
    expect(html).not.toContain('href="/computing"')
    expect(html).not.toContain('id="computing-heading"')
    expect(html).toContain('More coming soon.')
  })

  it('does not show Computing when only a subordinate flag is on', () => {
    disableFlag('COMPUTING_ENABLED')
    enableFlag('COMPUTING_BLOCKS_ENABLED')
    enableFlag('COMPUTING_PYTHON_ENABLED')

    const html = renderPage(ClassPage)

    expect(html).not.toContain('href="/computing"')
    expect(html).toContain('href="/class/simulations"')
  })

  it('shows the Computing card when the main flag is enabled', () => {
    enableFlag('COMPUTING_ENABLED')

    const html = renderPage(ClassPage)

    expect(html).toContain('href="/computing"')
    expect(html).toContain('id="computing-heading"')
    expect(html).toContain('id="computing-description"')
    expect(html).toContain('Explore Computing')
    expect(html).toContain(
      'Write and run code in your browser. Nothing to install.',
    )
  })

  it('places Computing after Simulations', () => {
    enableFlag('COMPUTING_ENABLED')

    const html = renderPage(ClassPage)

    const simulationsIndex = html.indexOf('id="simulations-heading"')
    const computingIndex = html.indexOf('id="computing-heading"')

    expect(simulationsIndex).toBeGreaterThanOrEqual(0)
    expect(computingIndex).toBeGreaterThan(simulationsIndex)
  })

  it('preserves the existing Class heading, breadcrumb and metadata', () => {
    enableFlag('COMPUTING_ENABLED')

    const html = renderPage(ClassPage)

    expect(html).toContain('aria-label="Breadcrumb"')
    expect(html).toContain('FIT LEARNING STUDIO')
    expect(html).toContain('<h1>Class</h1>')
    expect(html).toContain('More coming soon.')

    expect(classMetadata.title).toBe(
      'Class | FIT Learning Studio',
    )

    expect(classMetadata.alternates.canonical).toBe('/class')
  })

  it('uses an existing ActivityArt identifier for the new card', () => {
    enableFlag('COMPUTING_ENABLED')

    const html = renderPage(ClassPage)

    const activityArtCount = (
      html.match(/data-testid="activity-art"/g) || []
    ).length

    expect(activityArtCount).toBe(2)
  })

  it('provides accessible labels and descriptions for both cards', () => {
    enableFlag('COMPUTING_ENABLED')

    const html = renderPage(ClassPage)

    expect(html).toContain(
      'aria-labelledby="simulations-heading"',
    )

    expect(html).toContain(
      'aria-describedby="simulations-description"',
    )

    expect(html).toContain(
      'aria-labelledby="computing-heading"',
    )

    expect(html).toContain(
      'aria-describedby="computing-description"',
    )
  })
})

describe('Code Lab feature gate contract', () => {
  it('requires COMPUTING_ENABLED to be true for Code Lab access', () => {
    const canAccessCodeLab = (env) =>
      computingFlag('COMPUTING_ENABLED', env)

    expect(canAccessCodeLab({})).toBe(false)

    expect(
      canAccessCodeLab({
        COMPUTING_ENABLED: 'false',
      }),
    ).toBe(false)

    expect(
      canAccessCodeLab({
        COMPUTING_ENABLED: 'true',
      }),
    ).toBe(true)
  })

  it('does not grant Code Lab access through a subordinate flag', () => {
    const env = {
      COMPUTING_ENABLED: 'false',
      COMPUTING_BLOCKS_ENABLED: 'true',
      COMPUTING_PYTHON_ENABLED: 'true',
    }

    expect(computingFlag('COMPUTING_ENABLED', env)).toBe(false)
  })
})
