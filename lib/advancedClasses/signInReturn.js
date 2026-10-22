// Only these two existing feature entry points may override the normal sign-in
// destination. This is navigation, never an access grant; pages check the user.
const DESTINATIONS = new Set(['/class/projects', '/admin/advanced-classes'])

export function advancedClassesReturn(value) {
  return typeof value === 'string' && DESTINATIONS.has(value) ? value : null
}

export function withAdvancedClassesReturn(path, value) {
  const destination = advancedClassesReturn(value)
  return destination ? `${path}${path.includes('?') ? '&' : '?'}redirect_url=${encodeURIComponent(destination)}` : path
}
