'use client'
import { useId, useState } from 'react'
import { checkJoinCodeShape } from '@/lib/class/joinCode'
import styles from './ClassHub.module.css'

// PHASE 1: checks the shape of the code on this device and nothing else. No request is made, nothing is stored, and the message
// says so. A real join needs the server-side session and code system planned for the next phase.
export default function JoinCodeBox() {
  const id = useId()
  const [value, setValue] = useState('')
  const [result, setResult] = useState(null)
  const submit = event => {
    event.preventDefault()
    const checked = checkJoinCodeShape(value)
    setResult(checked.ok ? { ok: true, code: checked.code } : { ok: false, message: checked.message })
  }
  return <form className={styles.join} onSubmit={submit} noValidate aria-labelledby={id + '-title'}>
    <h2 id={id + '-title'}>Have a class code?</h2>
    <div className={styles.joinRow}>
      <label htmlFor={id + '-code'} className={styles.srOnly}>Class code</label>
      <input id={id + '-code'} className={styles.joinInput} value={value} onChange={event => { setValue(event.target.value); setResult(null) }} placeholder="Enter class code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={24} aria-describedby={id + '-note'} aria-invalid={result?.ok === false} />
      <button type="submit" className={styles.joinButton}>Join class</button>
    </div>
    <p id={id + '-note'} className={styles.joinNote}>Joining a live class with a code is not open yet.</p>
    <div role="status" className={styles.joinResult} data-state={result ? (result.ok ? 'pending' : 'invalid') : 'idle'}>
      {result?.ok === false && result.message}
      {result?.ok === true && <>That looks like a code. Joining is not open yet, so <strong>{result.code}</strong> was not sent, checked or saved. Keep it: it will work here once your teacher can start live classes.</>}
    </div>
  </form>
}
