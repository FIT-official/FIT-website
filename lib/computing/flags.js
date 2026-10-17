/**
 * Server-side feature flags for FIT Computing.
 *
 * All flags default to OFF. Only the exact string 'true' enables a flag.
 * Do not use this module for client-side authorisation or access control.
 */

export const COMPUTING_FLAG_NAMES = Object.freeze([
  'COMPUTING_ENABLED',
  'COMPUTING_BLOCKS_ENABLED',
  'COMPUTING_PYTHON_ENABLED',
  'COMPUTING_MATHS_ENABLED',
  'COMPUTING_SIGNALS_ENABLED',
  'COMPUTING_SQL_ENABLED',
])

export const computingFlagNames = COMPUTING_FLAG_NAMES

/**
 * Read an approved Computing feature flag.
 *
 * @param {string} name - An approved Computing environment variable name.
 * @param {object} env - Environment variables; defaults to process.env.
 * @returns {boolean} Whether the flag is explicitly enabled.
 */
export function computingFlag(name, env = process.env) {
  if (
    typeof name !== 'string' ||
    !COMPUTING_FLAG_NAMES.includes(name)
  ) {
    return false
  }

  if (!env || typeof env !== 'object') {
    return false
  }

  return Object.prototype.hasOwnProperty.call(env, name)
    && env[name] === 'true'
}
