import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const root = process.cwd()
const sourceDir = resolve(
  root,
  process.env.LEGAL_SOURCE_DIR || 'content/legal/source'
)
const lockPath = resolve(root, 'content/legal/versions.lock.json')

const documents = {
  customer: {
    filename: 'CUSTOMER_TERMS_v1.0.html',
    modulePath: 'content/legal/customerTermsV1.js',
    versionExport: 'CUSTOMER_TERMS_VERSION',
    hashExport: 'CUSTOMER_TERMS_SOURCE_SHA256',
    htmlExport: 'CUSTOMER_TERMS_HTML',
  },
  creator: {
    filename: 'CREATOR_TERMS_v1.0.html',
    modulePath: 'content/legal/creatorTermsV1.js',
    versionExport: 'CREATOR_TERMS_VERSION',
    hashExport: 'CREATOR_TERMS_SOURCE_SHA256',
    htmlExport: 'CREATOR_TERMS_HTML',
  },
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function assertValue(value, field) {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Missing or invalid ${field}`)
  }
}

async function loadLegalModule(filePath) {
  const source = await readFile(filePath)
  const url = `data:text/javascript;base64,${source.toString('base64')}`
  return import(url)
}

function extractBody(source, filename) {
  // The approved source uses LF line endings. Preserve all
  // bytes after <body>\n, including the LF before </body>.
  const sourceText = source.toString('utf8')
  const opening = /<body(?:\s[^>]*)?>\n/i.exec(sourceText)

  if (!opening) {
    throw new Error(
      `${filename}: expected a body opening tag followed by a newline`
    )
  }

  const bodyStart = opening.index + opening[0].length
  const closingPattern = /<\/body\s*>/gi
  closingPattern.lastIndex = bodyStart
  const closing = closingPattern.exec(sourceText)

  if (!closing || closing.index <= bodyStart) {
    throw new Error(
      `${filename}: expected a newline followed by a body closing tag`
    )
  }

  if (sourceText[closing.index - 1] !== '\n') {
    throw new Error(
      `${filename}: expected a newline followed by a body closing tag`
    )
  }

  const remainder = sourceText.slice(
    closing.index + closing[0].length
  )

  if (!/^\n<\/html\s*>\s*$/i.test(remainder)) {
    throw new Error(
      `${filename}: unexpected content after body closing tag`
    )
  }

  return Buffer.from(
    sourceText.slice(bodyStart, closing.index),
    'utf8'
  )
}

async function inspect() {
  const result = {}

  for (const [key, spec] of Object.entries(documents)) {
    const sourcePath = join(sourceDir, spec.filename)
    let source

    try {
      source = await readFile(sourcePath)
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(
          `${key}: legal source file not found at ${sourcePath}. ` +
          'Copy the approved FIT Business HTML source files ' +
          'to content/legal/source/ or set LEGAL_SOURCE_DIR.'
        )
      }
      throw error
    }

    const legalExports = await loadLegalModule(
      resolve(root, spec.modulePath)
    )

    const version = legalExports[spec.versionExport]
    const pinnedHash = legalExports[spec.hashExport]
    const exportedHtml = legalExports[spec.htmlExport]

    assertValue(version, `${key}.version`)
    assertValue(pinnedHash, `${key}.sourceSha256`)

    if (!/^[a-f0-9]{64}$/.test(pinnedHash)) {
      throw new Error(`${key}: invalid module SHA-256 format`)
    }

    if (typeof exportedHtml !== 'string') {
      throw new Error(`${key}: missing or invalid HTML export`)
    }

    const sourceHash = sha256(source)
    const expectedBody = extractBody(source, spec.filename)
    const exportedBody = Buffer.from(exportedHtml, 'utf8')

    result[key] = {
      version,
      sha256: sourceHash,
      pinnedHash,
      bytes: source.length,
      htmlMatchesSource: expectedBody.equals(exportedBody),
    }
  }

  return result
}

function validateModules(result) {
  for (const [key, item] of Object.entries(result)) {
    if (item.pinnedHash !== item.sha256) {
      throw new Error(
        `${key}: module SHA-256 differs from approved source`
      )
    }
    if (!item.htmlMatchesSource) {
      throw new Error(
        `${key}: exported HTML differs from approved source body`
      )
    }
  }
}

function lockPayload(result) {
  return Object.fromEntries(
    Object.entries(result).map(([key, item]) => [
      key,
      {
        version: item.version,
        sha256: item.sha256,
        bytes: item.bytes,
      },
    ])
  )
}

async function main() {
  const args = process.argv.slice(2)

  if (
    args.length > 1 ||
    (args.length === 1 && args[0] !== '--init')
  ) {
    throw new Error(
      'Usage: node scripts/legal-lock.mjs [--init]'
    )
  }

  const result = await inspect()
  validateModules(result)
  const actual = lockPayload(result)

  if (args[0] === '--init') {
    await writeFile(
      lockPath,
      JSON.stringify(actual, null, 2) + '\n',
      'utf8'
    )
    console.log('Legal source lock initialised.')
    return
  }

  let locked

  try {
    locked = JSON.parse(await readFile(lockPath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        'Legal source lock is missing. ' +
        'Run node scripts/legal-lock.mjs --init.'
      )
    }
    throw error
  }

  for (const key of Object.keys(documents)) {
    if (
      locked[key]?.version !== actual[key].version ||
      locked[key]?.sha256 !== actual[key].sha256 ||
      locked[key]?.bytes !== actual[key].bytes
    ) {
      throw new Error(
        `${key}: approved source differs from legal lock`
      )
    }
  }

  console.log('Legal source lock verified.')
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
