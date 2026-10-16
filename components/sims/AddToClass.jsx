'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import styles from './ClassSimulations.module.css'

export default function AddToClass({ simId }) {
    const pending = useRef(false)
    const [state, setState] = useState('idle'), [message, setMessage] = useState('')

    async function add() {
        if (pending.current || state === 'added') return
        pending.current = true
        setState('saving')
        setMessage('')
        try {
            const response = await fetch('/api/admin/workshop/guest/sims', {
                method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ simId }),
            })
            const result = await response.json()
            if ([401, 403].includes(response.status)) {
                setState('signin')
                setMessage('Sign in with your FIT teacher account to add activities.')
                return
            }
            if (!response.ok) throw new Error(result.error || 'The activity could not be added. Please try again.')
            setState('added')
            setMessage('Added to Workshop class.')
        } catch (error) {
            setState('error')
            setMessage(error.message || 'The activity could not be added. Please try again.')
        } finally { pending.current = false }
    }

    return <div className={styles.addControl}>
        {state !== 'added' && <span className={styles.target}>Workshop class</span>}
        {state === 'signin' ? <Link className={styles.button} href="/sign-in?redirect_url=%2Fclass%2Fsimulations">Teacher sign in <span aria-hidden="true">↗</span></Link> : <button type="button" className={styles.button} onClick={add} disabled={state === 'saving' || state === 'added'}>
            <span aria-hidden="true">{state === 'added' ? '✓' : '+'}</span> {state === 'saving' ? 'Adding…' : state === 'added' ? 'Added to class' : 'Add to class'}
        </button>}
        <span className={styles.feedback} role="status" aria-live="polite">{message}</span>
        {state === 'added' && <Link href="/admin/workshop" className={styles.textLink}>Open class <span aria-hidden="true">→</span></Link>}
    </div>
}
