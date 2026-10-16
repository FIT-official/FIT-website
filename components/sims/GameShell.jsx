'use client'

import dynamic from 'next/dynamic'
import { useEffect, useId, useRef, useState } from 'react'
import { emptyProgress, formatElapsed, GAME_CHALLENGES, GAME_LEVELS, progressSummary, readProgressState, recordAnswer, writeProgress } from '@/lib/sims/game'
import { createSoundPlayer } from '@/lib/sims/sound'
import styles from './GameShell.module.css'

const GameStage = dynamic(() => import('./GameShellStage'), { ssr: false, loading: () => <p className={styles.loading} role="status">Opening the experiment…</p> })
const GameCanvas = dynamic(() => import('./GameShellCanvas'), { ssr: false })
const NO_CHALLENGES = []

function GameSession({ activity, compact }) {
  const shell = useRef(null)
  const soundPlayer = useRef(null)
  const checkpointHeading = useRef(null)
  const focusNextCheckpoint = useRef(false)
  const [visible, setVisible] = useState(false)
  const [opened, setOpened] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(true)
  const [progress, setProgress] = useState(emptyProgress)
  const [loaded, setLoaded] = useState(false)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [sound, setSound] = useState(false)
  const [timer, setTimer] = useState(false)
  const [pageVisible, setPageVisible] = useState(true)
  const [seconds, setSeconds] = useState(0)
  const [choice, setChoice] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [celebration, setCelebration] = useState(0)
  const heading = useId()
  const challenges = GAME_CHALLENGES[activity.id] || NO_CHALLENGES
  const summary = progressSummary(progress, challenges)
  const current = challenges[summary.next]

  useEffect(() => {
    try {
      const saved = readProgressState(window.localStorage, activity.id, challenges)
      setProgress(saved.progress)
      setStorageAvailable(saved.available)
    } catch { setStorageAvailable(false) }
    setLoaded(true)
  }, [activity.id, challenges])

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState !== 'hidden')
    updateVisibility()
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => {
    if (!focusNextCheckpoint.current) return
    focusNextCheckpoint.current = false
    checkpointHeading.current?.focus()
  }, [summary.next])

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => setReducedMotion(motion.matches)
    updateMotion()
    motion.addEventListener('change', updateMotion)
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); setOpened(true) }
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
      const inView = entries.some(entry => entry.isIntersecting)
      setVisible(inView)
      if (inView) setOpened(true)
    }, { threshold: 0 }) : null
    if (shell.current) observer?.observe(shell.current)
    return () => { observer?.disconnect(); motion.removeEventListener('change', updateMotion) }
  }, [])

  useEffect(() => {
    if (!timer || !visible || !pageVisible) return
    const start = Date.now()
    const previous = seconds
    const interval = setInterval(() => setSeconds(previous + Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(interval)
    // This interval measures elapsed time from the instant a run starts/resumes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer, visible, pageVisible])

  useEffect(() => () => soundPlayer.current?.close(), [])

  function toggleSound() {
    const next = !sound
    setSound(next)
    if (next) { soundPlayer.current ||= createSoundPlayer(window); void soundPlayer.current.play(true) }
  }

  function submitAnswer(event) {
    event.preventDefault()
    if (choice === null || !current || !loaded) return
    const next = recordAnswer(progress, challenges, current.id, choice)
    const correct = choice === current.answer
    focusNextCheckpoint.current = correct
    setProgress(next)
    try { setStorageAvailable(writeProgress(window.localStorage, activity.id, next)) } catch { setStorageAvailable(false) }
    setFeedback({ correct, explanation: current.explanation })
    setChoice(null)
    if (correct) setCelebration(value => value + 1)
    if (sound) { soundPlayer.current ||= createSoundPlayer(window); void soundPlayer.current.play(correct) }
    if (progressSummary(next, challenges).completed === challenges.length) setTimer(false)
  }

  return <section ref={shell} className={`${styles.shell} ${compact ? styles.compact : ''}`} aria-label={`${activity.title} activity`} style={{ '--sim-accent': activity.accent || '#5361d8' }}>
    <div className={styles.bar}>
      <div className={styles.identity}><span className={styles.kicker}>FIT / EXPERIMENT</span><strong>Explore. Test. Explain.</strong></div>
      <div className={styles.utilities}>
        <button type="button" className={styles.control} aria-pressed={sound} onClick={toggleSound}><span aria-hidden="true">{sound ? '♪' : '♩'}</span> Sound {sound ? 'on' : 'off'}</button>
        <button type="button" className={styles.control} aria-pressed={timer} onClick={() => setTimer(value => !value)}>{timer ? 'Pause timer' : seconds > 0 ? 'Resume timer' : 'Start timer'}<span className={styles.clock}>{formatElapsed(seconds)}</span></button>
      </div>
    </div>
    <div className={styles.art}>{visible && <GameCanvas accent={activity.accent} celebration={celebration} reducedMotion={reducedMotion} />}</div>
    <div className={styles.progress}>
      <div className={styles.levels} aria-label="Concept checkpoint progress">{GAME_LEVELS.map((level, index) => <span key={level} className={`${styles.level} ${index < summary.completed ? styles.done : index === summary.next ? styles.active : ''}`}><span aria-hidden="true">{index < summary.completed ? '✓' : index + 1}</span>{level}<span className={styles.srOnly}>{index < summary.completed ? ', complete' : index === summary.next ? ', current' : ', next'}</span></span>)}</div>
      <div className={styles.score}><span aria-label={`${summary.stars} of ${challenges.length} stars`} className={styles.stars}>{challenges.map((challenge, index) => <span aria-hidden="true" key={challenge.id} className={index < summary.stars ? styles.earned : ''}>★</span>)}</span><strong>{summary.points}<small> points</small></strong></div>
    </div>
    <div className={styles.experiment}>{opened ? <GameStage activity={activity} /> : <div className={styles.placeholder}>The experiment opens when it comes into view.</div>}</div>
    {challenges.length > 0 && <div className={styles.checkpoints}>
      <div className={styles.checkpointIntro}><span className={styles.kicker}>CONCEPT CHECKPOINTS</span><h2 ref={checkpointHeading} tabIndex={-1} id={heading}>{current ? `${GAME_LEVELS[summary.next]} · ${summary.next + 1} of ${challenges.length}` : 'Three ideas, connected.'}</h2><p>Try the experiment, then check the ideas behind it. Stars track these answers; they do not measure your experiment.</p></div>
      <div className={styles.challenge}>
        {feedback && <div role="status" className={`${styles.feedback} ${feedback.correct ? styles.correct : ''}`}><strong>{feedback.correct ? 'That’s it.' : 'Keep exploring.'}</strong> {feedback.explanation}{feedback.correct && visible && <GameCanvas accent={activity.accent} celebration={celebration} reducedMotion={reducedMotion} />}</div>}
        {current ? <form onSubmit={submitAnswer} aria-labelledby={heading}><fieldset className={styles.fieldset}><legend>{current.question}</legend><div className={styles.choices}>{current.choices.map((answer, index) => <label className={`${styles.choice} ${choice === index ? styles.selected : ''}`} key={`${current.id}-${index}`}><input type="radio" name={`answer-${heading}`} value={index} checked={choice === index} onChange={() => setChoice(index)} /><span className={styles.radio} aria-hidden="true" /><span>{answer}</span></label>)}</div></fieldset><button type="submit" className={styles.primary} disabled={choice === null || !loaded}>Check answer <span aria-hidden="true">→</span></button></form> : <div className={styles.completed}><strong>All checkpoints complete</strong><p>Keep experimenting. Change one variable, make a prediction and explain the result using the model.</p></div>}
        <p className={styles.note}>{storageAvailable ? 'Progress stays in this browser only.' : 'Browser storage is unavailable. Progress lasts for this visit.'} First-try answers earn 100 points, second tries 75, and later tries 50. One star per completed checkpoint. The timer is optional and never affects points.</p>
      </div>
    </div>}
  </section>
}

export default function GameShell({ activity, compact = false }) { return <GameSession key={activity.id} activity={activity} compact={compact} /> }
