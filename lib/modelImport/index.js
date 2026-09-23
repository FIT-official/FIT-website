import { createSafeFetcher, MAX_PAGE_BYTES, normalizePublicUrl } from './safeFetch.js'
import { looksLikeHtml, modelFormat, validateModelResponse } from './file.js'
import { discoverFiles, fileCandidate, isGatedPage, sourceDetails } from './discovery.js'
import { importError } from './errors.js'

function checkStatus(response) {
  if ([401, 402, 403, 429].includes(response.status)) {
    throw importError('source_restricted', 'The source requires a login, purchase, or browser verification, or is limiting downloads.')
  }
  if (response.status !== 200) throw importError('source_unavailable', 'The source did not provide a public model download.')
}

export async function importPublicModel({ url, selectionUrl }, { fetchPublic = createSafeFetcher() } = {}) {
  let source = sourceDetails(url)
  const initial = fileCandidate(source.url, source.url)
  if (!initial && source.provider === 'Direct file') {
    throw importError('unsupported_source', 'Use a MakerWorld, Printables or Thingiverse design link, or a direct STL, OBJ or 3MF HTTPS download link.')
  }
  if (initial) {
    if (selectionUrl && normalizePublicUrl(selectionUrl).href !== initial.url) throw importError('invalid_selection', 'That file does not belong to this source.', 400)
    const response = await fetchPublic(initial.url)
    checkStatus(response)
    return { status: 'imported', source, file: validateModelResponse(response, initial.name) }
  }

  let response = await fetchPublic(source.url, { maxBytes: MAX_PAGE_BYTES })
  checkStatus(response)
  if (!looksLikeHtml(response.body, response.headers['content-type'])) {
    // Some public download endpoints do not end with an extension; the response must name the file.
    return { status: 'imported', source, file: validateModelResponse(response) }
  }
  let html = response.body.toString('utf8')
  if (isGatedPage(html)) throw importError('source_restricted', 'The source requires browser verification, a login, or access to the model.')
  let discovery = discoverFiles(html, response.url, source)
  source = discovery.source
  if (!discovery.files.length && discovery.filesPage) {
    response = await fetchPublic(discovery.filesPage, { maxBytes: MAX_PAGE_BYTES })
    checkStatus(response)
    html = response.body.toString('utf8')
    if (isGatedPage(html)) throw importError('source_restricted', 'The source requires browser verification, a login, or access to the model.')
    discovery = discoverFiles(html, response.url, source)
    source = discovery.source
  }
  if (!discovery.files.length) {
    throw importError('no_public_download', 'No public STL, OBJ or 3MF download was available in this page. The site may load its files after a login or in your browser.')
  }
  let selected
  if (selectionUrl) {
    const normalized = normalizePublicUrl(selectionUrl).href
    selected = discovery.files.find(file => file.url === normalized)
    if (!selected) throw importError('invalid_selection', 'That file is no longer available from this design page. Import the design link again.', 400)
  } else if (discovery.files.length > 1) {
    return { status: 'select_file', source, files: discovery.files }
  } else selected = discovery.files[0]
  response = await fetchPublic(selected.url)
  checkStatus(response)
  const file = validateModelResponse(response, selected.name)
  if (file.format !== modelFormat(selected.name)) throw importError('invalid_model', 'The downloaded file format did not match the source link.')
  return { status: 'imported', source, file }
}
