'use client'

import { LIMITS } from '@/lib/researchProjects/config'
import RichText from './RichText'
import styles from './ResearchProjects.module.css'

const TYPE_LABEL = {
  mcq: 'Multiple choice', short: 'Short answer', calculation: 'Calculation', derivation: 'Derivation',
  explain: 'Explain the physics', reflection: 'Reflection',
}

function KeyPanel({ question, keyData, auto }) {
  if (!keyData) return null
  return (
    <div className={styles.keyPanel} role="group" aria-label={`Answer key for question ${question.id}`}>
      <p><strong>Answer key</strong>
        {auto !== undefined ? <span className={styles.badge} data-source={auto ? 'simulation' : 'measured'}>{auto ? 'Matches the key' : 'Does not match the key'}</span> : null}
      </p>
      {keyData.type === 'mcq' ? <p>Correct option: <strong>{keyData.correct.toUpperCase()}</strong>. {keyData.why}</p> : null}
      {keyData.type === 'calculation' ? <p>Expected value: <strong>{Number(keyData.value.toPrecision(4))}</strong>{keyData.unit ? ` ${keyData.unit}` : ''} (within {keyData.tolerancePct}%). {keyData.working}</p> : null}
      {keyData.type === 'text' ? (
        <>
          <p>Marking points:</p>
          <ul>{keyData.points.map(p => <li key={p}>{p}</li>)}</ul>
          {keyData.notes ? <p className={styles.note}>{keyData.notes}</p> : null}
        </>
      ) : null}
    </div>
  )
}

export default function QuestionList({ questions, answers, editable, onAnswer, keys, auto }) {
  return (
    <ol className={styles.questions}>
      {questions.map((q, n) => {
        const a = answers[q.id] || {}
        return (
          <li key={q.id} id={'question-' + q.id}>
            <div className={styles.qHead}>
              <span className={styles.tag}>{TYPE_LABEL[q.type]}</span>
              <span className={styles.tag}>{q.marks} marks</span>
            </div>
            {q.type === 'mcq' ? (
              <fieldset disabled={!editable}>
                <legend><span className={styles.qNum}>Question {n + 1}.</span> <RichText text={q.prompt} /></legend>
                {q.options.map(o => (
                  <label key={o.id} className={styles.option}>
                    <input type="radio" name={'q-' + q.id} value={o.id} checked={a.choice === o.id} onChange={() => onAnswer(q.id, { choice: o.id })} />
                    <span><span className={styles.optionId}>{o.id.toUpperCase()}.</span> <RichText text={o.text} /></span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <div>
                <p id={'prompt-' + q.id} className={styles.prompt}><span className={styles.qNum}>Question {n + 1}.</span> <RichText text={q.prompt} /></p>
                {q.type === 'calculation' ? (
                  <label className={styles.inline}>Your answer{q.unit ? ` (${q.unit})` : ''}
                    <input inputMode="decimal" aria-label={`Numeric answer to question ${n + 1}`} value={a.value ?? ''} readOnly={!editable} aria-describedby={'prompt-' + q.id}
                      onChange={e => onAnswer(q.id, { value: e.target.value })} />
                  </label>
                ) : null}
                <div className={styles.block}><span className={styles.labelStrong}>{q.type === 'calculation' ? 'Working' : 'Your answer'}</span>
                  <textarea rows={q.type === 'short' || q.type === 'calculation' ? 3 : 6} value={a.text ?? ''} readOnly={!editable} maxLength={LIMITS.longText}
                    aria-label={`${q.type === 'calculation' ? 'Working for' : 'Answer to'} question ${n + 1}`} aria-describedby={'prompt-' + q.id} onChange={e => onAnswer(q.id, { text: e.target.value })} />
                </div>
                <span className={styles.note}>{(a.text ?? '').length} / {LIMITS.longText}</span>
              </div>
            )}
            <KeyPanel question={q} keyData={keys?.[q.id]} auto={auto?.[q.id]} />
          </li>
        )
      })}
    </ol>
  )
}
