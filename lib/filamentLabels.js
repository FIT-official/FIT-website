// Display-only wording. Canonical option IDs and stored names never change.
export function filamentOptionLabel(type, name) {
  if (/^spool$/i.test(type || '')) {
    if (/^(without spool|no spool|refill)$/i.test(name || '')) return 'Refill (no spool)'
    if (/^with spool$/i.test(name || '')) return 'With spool'
  }
  return name
}
