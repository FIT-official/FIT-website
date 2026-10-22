'use client'

import RichText from './RichText'
import styles from './ResearchProjects.module.css'

// To-do items are real progress records: ticks are saved with the team record.
export default function Checklist({ items, todo, editable, onToggle, label }) {
  const done = items.filter(i => todo[i.id]).length
  return (
    <div>
      <p className={styles.note} role="status">{done} of {items.length} done</p>
      <ul className={styles.checklist} aria-label={label}>
        {items.map(i => (
          <li key={i.id}>
            <label>
              <input type="checkbox" checked={!!todo[i.id]} disabled={!editable} onChange={() => onToggle(i.id)} />
              <span><RichText text={i.text} />{i.detail ? <span className={styles.detail}> {i.detail}</span> : null}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
