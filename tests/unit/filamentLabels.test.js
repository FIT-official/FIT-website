import { expect, it } from 'vitest'
import { filamentOptionLabel } from '@/lib/filamentLabels'
it('clarifies only known spool options while preserving unfamiliar labels',()=>{
 expect(filamentOptionLabel('Spool','Without Spool')).toBe('Refill (no spool)')
 expect(filamentOptionLabel('Spool','With Spool')).toBe('With spool')
 expect(filamentOptionLabel('Spool','Unknown packaging')).toBe('Unknown packaging')
 expect(filamentOptionLabel('Colour','Without Spool')).toBe('Without Spool')
})
