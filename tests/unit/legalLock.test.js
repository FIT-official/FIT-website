/* @vitest-environment node */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const script = resolve(process.cwd(), 'scripts/legal-lock.mjs')

let root
let sourceDir

function hash(value) {
  return createHash('sha256')
    .update(value)
    .digest('hex')
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function fullDocument(body) {
  return [
    '<!DOCTYPE html>',
    '<html lang="en-GB">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>Fixture</title>',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

const customerBody =
  '<h1>Customer fixture</h1>\n<p>First line</p>\n'
const creatorBody =
  '<h1>Creator fixture</h1>\n<p>Second line</p>\n'

function documentSpec(key) {
  return key === 'customer'
    ? {
      prefix: 'CUSTOMER',
      filename: 'CUSTOMER_TERMS_v1.0.html',
      moduleFile: 'customerTermsV1.js',
    }
    : {
      prefix: 'CREATOR',
      filename: 'CREATOR_TERMS_v1.0.html',
      moduleFile: 'creatorTermsV1.js',
    }
}

function makeDocument(key, body) {
  const spec = documentSpec(key)
  // Body includes the LF immediately before </body>.
  const source = fullDocument(body.slice(0, -1))

  write(join(sourceDir, spec.filename), source)
  write(
    join(root, 'content/legal', spec.moduleFile),
    [
      `export const ${spec.prefix}_TERMS_VERSION = 'fixture-version'`,
      `export const ${spec.prefix}_TERMS_SOURCE_SHA256 = ${JSON.stringify(hash(source))}`,
      `export const ${spec.prefix}_TERMS_HTML = ${JSON.stringify(body)}`,
      '',
    ].join('\n')
  )
}

function modulePath(key) {
  return join(
    root,
    'content/legal',
    documentSpec(key).moduleFile
  )
}

function sourcePath(key) {
  return join(sourceDir, documentSpec(key).filename)
}

function lockPath() {
  return join(root, 'content/legal/versions.lock.json')
}

function runWithEnv(envOverrides = {}, ...args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: { ...process.env, ...envOverrides },
    encoding: 'utf8',
  })
}

function run(...args) {
  return runWithEnv(
    { LEGAL_SOURCE_DIR: sourceDir },
    ...args
  )
}

function expectSuccess(result) {
  expect(
    result.status,
    `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  ).toBe(0)
}

function expectFailure(result) {
  expect(result.status).not.toBe(0)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fit-legal-lock-'))
  sourceDir = join(root, 'content/legal/source')
  makeDocument('customer', customerBody)
  makeDocument('creator', creatorBody)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('Legal source lock', () => {
  it('initialises using full-source SHA-256 and byte counts', () => {
    expectSuccess(run('--init'))

    const locked = JSON.parse(
      readFileSync(lockPath(), 'utf8')
    )
    const customerSource = readFileSync(sourcePath('customer'))
    const creatorSource = readFileSync(sourcePath('creator'))

    expect(locked.customer).toEqual({
      version: 'fixture-version',
      sha256: hash(customerSource),
      bytes: customerSource.length,
    })
    expect(locked.creator).toEqual({
      version: 'fixture-version',
      sha256: hash(creatorSource),
      bytes: creatorSource.length,
    })
    expect(locked.customer.sha256).not.toBe(hash(customerBody))
    expect(locked.creator.sha256).not.toBe(hash(creatorBody))
  })

  it('passes check mode when sources and modules match', () => {
    expectSuccess(run('--init'))
    expectSuccess(run())
  })

  it('uses the repository-relative default source directory', () => {
    expectSuccess(
      runWithEnv({ LEGAL_SOURCE_DIR: '' }, '--init')
    )
  })

  it('supports LEGAL_SOURCE_DIR override', () => {
    const alternative = join(root, 'fixtures/approved-source')
    mkdirSync(alternative, { recursive: true })

    for (const key of ['customer', 'creator']) {
      write(
        join(alternative, documentSpec(key).filename),
        readFileSync(sourcePath(key))
      )
    }

    expectSuccess(
      runWithEnv(
        { LEGAL_SOURCE_DIR: alternative },
        '--init'
      )
    )
    expectSuccess(
      runWithEnv({ LEGAL_SOURCE_DIR: alternative })
    )
  })

  it('preserves whitespace and Unicode in exported body', () => {
    makeDocument(
      'customer',
      '<h1>Fixture</h1>\n<p>Preserve  spaces — café.</p>\n'
    )
    expectSuccess(run('--init'))
    expectSuccess(run())
  })

  it('fails when exported body omits the trailing newline', () => {
    expectSuccess(run('--init'))
    const path = modulePath('customer')
    const original = readFileSync(path, 'utf8')
    const modified = original.replace(
      JSON.stringify(customerBody),
      JSON.stringify(customerBody.slice(0, -1))
    )

    expect(modified).not.toBe(original)
    write(path, modified)

    const result = run()
    expectFailure(result)
    expect(result.stderr).toContain(
      'exported HTML differs from approved source body'
    )
  })

  it('fails when one byte of exported body differs', () => {
    expectSuccess(run('--init'))
    const path = modulePath('customer')
    const original = readFileSync(path, 'utf8')
    const modified = original.replace(
      JSON.stringify(customerBody),
      JSON.stringify(
        customerBody.replace('First line', 'First Line')
      )
    )

    expect(modified).not.toBe(original)
    write(path, modified)

    const result = run()
    expectFailure(result)
    expect(result.stderr).toContain(
      'exported HTML differs from approved source body'
    )
  })

  it('fails when a source changes after locking', () => {
    expectSuccess(run('--init'))
    const original = readFileSync(sourcePath('customer'), 'utf8')
    write(
      sourcePath('customer'),
      original.replace('First line', 'Modified line')
    )
    expectFailure(run())
  })

  it('fails when pinned module SHA-256 differs', () => {
    expectSuccess(run('--init'))
    const path = modulePath('customer')
    const original = readFileSync(path, 'utf8')
    const oldHash = hash(readFileSync(sourcePath('customer')))
    const modified = original.replace(oldHash, 'f'.repeat(64))

    expect(modified).not.toBe(original)
    write(path, modified)

    const result = run()
    expectFailure(result)
    expect(result.stderr).toContain(
      'module SHA-256 differs from approved source'
    )
  })

  it('fails during init if the pinned hash is wrong', () => {
    const path = modulePath('creator')
    const original = readFileSync(path, 'utf8')
    const oldHash = hash(readFileSync(sourcePath('creator')))
    write(path, original.replace(oldHash, '0'.repeat(64)))
    expectFailure(run('--init'))
  })

  it('fails during init if exported HTML differs', () => {
    const path = modulePath('creator')
    const original = readFileSync(path, 'utf8')
    const modified = original.replace(
      JSON.stringify(creatorBody),
      JSON.stringify('<h1>Different fixture</h1>\n')
    )
    expect(modified).not.toBe(original)
    write(path, modified)

    const result = run('--init')
    expectFailure(result)
    expect(result.stderr).toContain(
      'exported HTML differs from approved source body'
    )
  })

  it('fails when source and module change together after locking', () => {
    expectSuccess(run('--init'))
    makeDocument('customer', '<h1>Updated fixture</h1>\n')

    const result = run()
    expectFailure(result)
    expect(result.stderr).toContain(
      'approved source differs from legal lock'
    )
  })

  it('fails when the module version changes', () => {
    expectSuccess(run('--init'))
    const path = modulePath('customer')
    write(
      path,
      readFileSync(path, 'utf8').replace(
        "'fixture-version'",
        "'changed-version'"
      )
    )
    const result = run()
    expectFailure(result)
    expect(result.stderr).toContain(
      'approved source differs from legal lock'
    )
  })

  it('fails if the lock has not been initialised', () => {
    const result = run()
    expectFailure(result)
    expect(result.stderr).toContain(
      'Legal source lock is missing'
    )
  })

  it('fails if an approved source file is missing', () => {
    rmSync(sourcePath('creator'))
    const result = run('--init')
    expectFailure(result)
    expect(result.stderr).toContain(
      'legal source file not found'
    )
  })

  it('fails for an unsupported argument', () => {
    const result = run('--unknown')
    expectFailure(result)
    expect(result.stderr).toContain(
      'Usage: node scripts/legal-lock.mjs [--init]'
    )
  })

  it('fails for a missing body closing tag', () => {
    write(
      sourcePath('customer'),
      '<!DOCTYPE html>\n<html>\n<body>\n<h1>Missing</h1>\n</html>\n'
    )
    const result = run('--init')
    expectFailure(result)
    expect(result.stderr).toContain(
      'expected a newline followed by a body closing tag'
    )
  })

  it('fails when unexpected content follows the body', () => {
    write(
      sourcePath('customer'),
      '<!DOCTYPE html>\n<html>\n<body>\n<h1>Fixture</h1>\n</body>\n<script>unexpected</script>\n</html>\n'
    )
    const result = run('--init')
    expectFailure(result)
    expect(result.stderr).toContain(
      'unexpected content after body closing tag'
    )
  })
})
