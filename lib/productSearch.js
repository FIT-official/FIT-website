// Only known component families join a letter prefix to its numeric model.
// Keep suffix tokens and all other words separate: USB C is not USBC,
// ESP32-C3 is not ESP32-S3, and ESP320 is not ESP32.
const MODEL_PREFIXES = 'esp|stm|stm32|atmega|attiny|rp|ch|nrf|mpu'
const spacedModel = new RegExp(`\\b(${MODEL_PREFIXES})[\\s-]+(?=\\d)`, 'g')

function tokens(value) {
  return String(value ?? '').toLowerCase().replace(spacedModel, '$1').match(/[\p{L}\p{N}]+/gu) || []
}

export function matchesProductSearch(product, query = '') {
  const terms = tokens(query)
  if (!terms.length) return !String(query).trim() // Punctuation alone is not an empty search.
  const fields = [product.name, product.description].map(tokens)
  return terms.every(term => fields.some(words => words.some(word =>
    /\p{L}/u.test(term) && /\p{N}/u.test(term) ? word === term : word.includes(term)
  )))
}
