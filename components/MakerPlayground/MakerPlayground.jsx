'use client'

import { useEffect, useRef, useState } from 'react'
import { boards, lessons, starterSketch } from '@/lib/makerPlayground/starters'
import { MAX_SOURCE, previewSketch } from '@/lib/makerPlayground/preview'
import { exportName, loadDraft, removeDraft, saveDraft } from '@/lib/makerPlayground/storage'
import styles from './MakerPlayground.module.css'

export default function MakerPlayground() {
  const [boardId, setBoard] = useState('uno'), [lessonId, setLesson] = useState('blink')
  const [source, setSource] = useState(() => starterSketch('uno', 'blink'))
  const [savedSource, setSavedSource] = useState(() => starterSketch('uno', 'blink'))
  const [ready, setReady] = useState(false), [status, setStatus] = useState('Loading local draft…')
  const [iterations, setIterations] = useState(4), [pressed, setPressed] = useState(false)
  const [result, setResult] = useState(null), [frame, setFrame] = useState(0)
  const editor = useRef(null)
  const board = boards.find(item => item.id === boardId), lesson = lessons.find(item => item.id === lessonId)
  const dirty = source !== savedSource
  const event = result?.ok ? result.events[frame] : null
  const serial = result?.ok ? result.events.slice(0, frame + 1).filter(item => item.kind === 'serial') : []
  function restore(boardKey, lessonKey) {
    let draft
    try { draft = loadDraft(window.localStorage, boardKey, lessonKey) } catch { draft = { status: 'unavailable' } }
    const next = draft.status === 'restored' ? draft.source : starterSketch(boardKey, lessonKey)
    setSource(next); setSavedSource(next)
    setStatus(draft.status === 'restored' ? 'Saved draft restored from this browser.' : draft.status === 'empty' ? 'Starter ready. Save on this device to keep your edits.' : 'Saved draft could not be read. It has not been overwritten. Export your work if storage is unavailable.')
    setResult(null); setFrame(0); setReady(true)
  }
  useEffect(() => { restore('uno', 'blink') }, [])
  useEffect(() => {
    if (!dirty) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  function choose(nextBoard, nextLesson) {
    if (dirty && !window.confirm('Discard unsaved edits and switch? Cancel to save or export first.')) return
    setBoard(nextBoard); setLesson(nextLesson); setPressed(false); restore(nextBoard, nextLesson)
  }
  function save() {
    let saved = false
    try { saved = saveDraft(window.localStorage, boardId, lessonId, source) } catch { /* Storage can be blocked by the browser. */ }
    if (saved) { setSavedSource(source); setStatus('Saved on this device. This draft is not uploaded or synced.') }
    else setStatus('Could not save on this device. Your edits are still here; export an .ino copy.')
  }
  function reset() {
    if (!window.confirm('Reset this lesson and remove its saved draft? Export first to keep a copy.')) return
    let removed = false
    try { removed = removeDraft(window.localStorage, boardId, lessonId) } catch { /* Keep working without persistence. */ }
    const next = starterSketch(boardId, lessonId)
    setSource(next); setSavedSource(next); setResult(null); setFrame(0)
    setStatus(removed ? 'Starter restored; this lesson’s saved draft was removed.' : 'Starter restored in the editor, but the saved draft could not be removed.')
  }
  function download() {
    let url
    try {
      url = URL.createObjectURL(new Blob([source], { type: 'text/plain;charset=utf-8' }))
      const link = document.createElement('a'); link.href = url; link.download = exportName(boardId, lessonId)
      document.body.appendChild(link); link.click(); link.remove()
      // Allow the browser to start the download before releasing the blob.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatus('Export requested. Check your downloads, then open the .ino in Arduino IDE.')
    } catch { if (url) URL.revokeObjectURL(url); setStatus('Export is unavailable in this browser. Select and copy the sketch to keep it.') }
  }
  function run() {
    const next = previewSketch(source, { board: boardId, iterations, buttonPressed: pressed })
    setResult(next); setFrame(0)
  }
  function jumpToLine() {
    if (!result || result.ok) return
    const lines = source.split('\n'), start = lines.slice(0, result.line - 1).reduce((n, line) => n + line.length + 1, 0)
    editor.current?.focus(); editor.current?.setSelectionRange(start, start + (lines[result.line - 1]?.length || 0))
  }

  return <main className={`${styles.shell} ph-no-capture rr-block`}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>FIT / MAKER LAB</p>
      <h1>Small sketches.<br /><span>Real understanding.</span></h1>
      <p className={styles.intro}>Write a little, predict what happens, then explore the logic. Take your sketch to a real board when you’re ready.</p>
      <div className={styles.tags}><span>Arduino + ESP32</span><span>Works in your browser</span><span>No account needed</span></div>
    </header>
    <aside className={styles.notice} aria-label="Preview capabilities"><strong>Educational logic preview</strong><p>Runs a small, documented subset of your sketch. It does not compile C++, emulate a board, connect to hardware or simulate electrical behaviour. Export to Arduino IDE to compile and upload.</p></aside>
    <div className={styles.selectors}>
      <label>Board profile<select value={boardId} onChange={e => choose(e.target.value, lessonId)} disabled={!ready}>{boards.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Starter lesson<select value={lessonId} onChange={e => choose(boardId, e.target.value)} disabled={!ready}>{lessons.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    <div className={styles.workspace}>
      <section className={styles.editorPanel} aria-labelledby="sketch-heading">
        <div className={styles.panelHead}><h2 id="sketch-heading">Your sketch</h2><span>{dirty ? 'Unsaved edits' : 'Ready to edit'}</span></div>
        <p>{lesson.goal}</p>
        <label className={styles.editorLabel} htmlFor="maker-sketch">Sketch source</label>
        <textarea id="maker-sketch" ref={editor} className={styles.editor} value={source} maxLength={MAX_SOURCE} spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={!ready} aria-describedby="editor-help" onChange={e => { setSource(e.target.value); setResult(null); setFrame(0) }} />
        <p id="editor-help" className={styles.small}>Plain-text editor · Tab moves to the next control · {source.length.toLocaleString()} / 16,000 characters</p>
        <div className={styles.actions}><button type="button" disabled={!ready} onClick={save}>Save on this device</button><button type="button" disabled={!ready} onClick={download}>Export .ino</button><button type="button" disabled={!ready} onClick={reset}>Reset lesson</button></div>
        <p className={styles.saveStatus} role="status">{status}</p>
        <p className={styles.small}>Drafts stay in this browser, one per board and lesson. Shared devices share these drafts. Clearing browser data removes them. Nothing you type is sent by this playground.</p>
        <div className={styles.challenge}><strong>Try a change</strong><p>{lesson.challenge}</p></div>
      </section>
      <section className={styles.previewPanel} aria-labelledby="preview-heading">
        <div className={styles.panelHead}><h2 id="preview-heading">Logic preview</h2><span>Virtual time</span></div>
        <p>Preview setup once, then a few loop passes. Step through the trace at your own pace.</p>
        <div className={styles.previewControls}>
          <label>Loop passes<select value={iterations} onChange={e => { setIterations(Number(e.target.value)); setResult(null) }}>{[1, 2, 4, 8].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          <label className={styles.check}><input type="checkbox" checked={pressed} onChange={e => { setPressed(e.target.checked); setResult(null) }} />Button pressed</label>
        </div>
        <p className={styles.small}>The button setting applies to all INPUT_PULLUP reads for the entire preview.</p>
        <button type="button" className={styles.primary} disabled={!ready} onClick={run}>Preview sketch logic</button>
        {result && !result.ok && <div className={styles.error} role="alert"><strong>Preview stopped · line {result.line}</strong><p>{result.error}</p><p>Your sketch is unchanged. No partial result is shown.</p><button type="button" onClick={jumpToLine}>Go to error line</button></div>}
        {result?.ok ? <>
          <p role="status" className={styles.small}>Trace ready · {result.events.length} events · {result.time} ms virtual duration</p>
          {event ? <>
            <div className={styles.signal} aria-label="Output pins at selected event">
              <span className={styles.clock}>{event.time}<small> ms</small></span>
              {Object.keys(event.pins).length ? Object.entries(event.pins).map(([pin, high]) => <span key={pin} className={styles.pin}><i className={high ? styles.high : styles.low} aria-hidden="true" />Pin {pin} · {high ? 'HIGH' : 'LOW'}</span>) : <span>No output has been written yet.</span>}
            </div>
            <p className={styles.current} aria-live="polite"><strong>Event {frame + 1} / {result.events.length}</strong> · line {event.line}<br />{event.detail}</p>
            <div className={styles.actions}><button type="button" disabled={frame === 0} onClick={() => setFrame(n => n - 1)}>Previous event</button><button type="button" disabled={frame >= result.events.length - 1} onClick={() => setFrame(n => n + 1)}>Next event</button><button type="button" onClick={() => setFrame(result.events.length - 1)}>Show final event</button></div>
          </> : <p>No output events. Try adding digitalWrite or Serial.println.</p>}
          <h3 className={styles.subheading}>Serial text through this event</h3>
          <pre className={styles.serial} aria-label="Serial text">{serial.length ? serial.map(item => `${item.time} ms  ${item.detail}`).join('\n') : 'No Serial.println output yet.'}</pre>
          <details className={styles.details}><summary>Complete event trace</summary><div className={styles.trace}><table><caption>All events from this preview</caption><thead><tr><th scope="col">ms</th><th scope="col">Line</th><th scope="col">Event</th></tr></thead><tbody>{result.events.map((item, i) => <tr key={i}><td>{item.time}</td><td>{item.line}</td><td>{item.detail}</td></tr>)}</tbody></table></div></details>
        </> : !result && <div className={styles.empty}><span aria-hidden="true">01 → 02 → 03</span><p>Your trace will appear here.<br />Try the starter, then change one instruction.</p></div>}
        <details className={styles.details}><summary>Preview language & limits</summary><p>Supported: decimal whole numbers, int and const int variables, assignment, + and −, comparisons, !, if / else with braces, setup() and loop(), pinMode, digitalWrite, digitalRead, delay, Serial.begin and Serial.println. Print a quoted string or a number; comments are allowed.</p><p>Modes: OUTPUT and INPUT_PULLUP. UNO pins: 0–13. ESP32 pins: 4, 13, 14, 18, 19, 21–23, 25–27, 32–33. LED_BUILTIN is available only for UNO.</p><p>Limits: 8 loop passes, 256 events, 60 seconds of virtual time, 10 seconds per delay and whole numbers within ±1,000,000. No integer-width overflow model. Source size and expression depth are also bounded.</p><p>Other C++ features, libraries, arrays, for / while loops, functions, analog I/O, PWM, interrupts, networking and peripherals are unsupported. This is not a compiler check; passing the preview does not prove a sketch will compile or work on hardware.</p></details>
      </section>
    </div>
    <section className={styles.reference} aria-labelledby="board-heading">
      <div><p className={styles.eyebrow}>BEFORE YOU WIRE</p><h2 id="board-heading">{board.name}</h2><p>{board.summary}</p><p>{board.wiring}</p><p className={styles.small}>{board.caution}</p></div>
      <div><table><caption>Selected pins for this board profile</caption><thead><tr><th scope="col">Pin</th><th scope="col">Use / restriction</th></tr></thead><tbody>{board.pins.map(([pin, use]) => <tr key={pin}><th scope="row">{pin}</th><td>{use}</td></tr>)}</tbody></table><div className={styles.sources}>{board.links.map(([label, href]) => <a key={href} href={href} target="_blank" rel="noopener noreferrer">{label} ↗</a>)}</div></div>
    </section>
    <section className={styles.next}><h2>Take it to your board</h2><ol><li>Export your sketch and open it in Arduino IDE.</li><li>Select your exact board and its installed board package, then use Verify to compile.</li><li>Check the official pinout and wiring before uploading. This preview has not tested your circuit.</li></ol><a href="https://docs.arduino.cc/software/ide-v2/" target="_blank" rel="noopener noreferrer">Arduino IDE guide ↗</a></section>
  </main>
}
