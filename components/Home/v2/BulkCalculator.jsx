'use client'

import { useState } from 'react'
import { BULK_LADDERS, BULK_PRICE_NOTICE, priceBulkLines } from '@/lib/bulkFilamentConfig'
import styles from './home.module.css'

const money = cents => `S$${(cents / 100).toFixed(2)}`

export default function BulkCalculator() {
    const [material, setMaterial] = useState('PLA')
    const [rolls, setRolls] = useState('10')
    const quantity = Number(rolls)
    const valid = rolls.trim() !== '' && Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 1000000
    const price = valid ? priceBulkLines([{ ladder: material, quantity }])[0] : null
    return <div className={styles.calculator}>
        <p className={styles.eyebrow}>Estimate your filament order</p>
        <div className={styles.fields}>
            <label htmlFor="bulk-material">Material<select id="bulk-material" value={material} onChange={event => setMaterial(event.target.value)}>
                {Object.entries(BULK_LADDERS).map(([key, value]) => <option key={key} value={key}>{key === 'PLA' ? 'Lanbo PLA' : key === 'PETG' ? 'Lanbo PETG' : value.label}</option>)}
            </select></label>
            <label htmlFor="bulk-rolls">1kg rolls<input id="bulk-rolls" type="number" min="1" max="1000000" step="1" inputMode="numeric" value={rolls}
                aria-invalid={!valid} aria-describedby={!valid ? 'bulk-error' : undefined} onChange={event => setRolls(event.target.value)} /></label>
        </div>
        <div className={styles.estimate} aria-live="polite" aria-atomic="true">
            {price ? <>
                <p className={styles.band}>Quantity band: {price.band} rolls</p>
                <dl className={styles.prices}><div><dt>Per roll</dt><dd>{money(price.unitCents)}</dd></div><div><dt>Indicative total</dt><dd>{money(price.lineCents)}</dd></div></dl>
            </> : <p id="bulk-error" className={styles.inputError}>Enter a whole number from 1 to 1,000,000 rolls.</p>}
        </div>
        <p className={styles.finePrint}>{BULK_PRICE_NOTICE} Prices in SGD. Delivery is not included.</p>
    </div>
}
