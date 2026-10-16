// Read on the server; client components receive only the resulting boolean.
export function simsAddToClassEnabled() {
    return process.env.SIMS_ADD_TO_CLASS === '1'
}
