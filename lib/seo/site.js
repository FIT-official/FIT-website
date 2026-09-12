export const SITE_URL = 'https://www.fixitoday.com'

export function absoluteUrl(path = '/') {
    return new URL(path, SITE_URL).href
}
