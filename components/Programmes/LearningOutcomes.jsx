import styles from './ProgrammeEvidence.module.css'
const outcomes = [
    ['01', 'Choose something to make', 'Sketch a small model, measure a part or decide what a button should do. Start with an idea you can try.', 'A sketch, model or circuit plan'],
    ['02', 'Put it together', 'Print, wire or join the pieces. Try the result: does the lid fit, does the light respond, does the mechanism move?', 'A part or circuit you can test'],
    ['03', 'Show what you changed', 'Keep the first attempt, make an adjustment and compare the two. Explain what worked and what you would try next.', 'A short explanation of what changed'],
]
export default function LearningOutcomes({ company = false }) {
    return <section className={styles.section} aria-labelledby="learning-outcomes">
        <p className={styles.eyebrow}>MAKE SOMETHING. TRY IT. TALK ABOUT IT.</p><h2 id="learning-outcomes">Something to make.<br /><em>Something to be proud of.</em></h2><p className={styles.intro}>{company ? 'A desk organiser, a shared model or a circuit that responds when you press a button. Choose a project your group would enjoy, and we will help you work through it.' : 'A first keychain, a model room or a button that lights up. Give students something they can hold, test and show to someone else.'} These are programme goals. We choose the project and level of guidance with you.</p>
        <div className={styles.cards}>{outcomes.map(([number, title, description, evidence]) => <article key={number} className={styles.outcome}><span className={styles.number}>{number}</span><h3>{title}</h3><p>{description}</p><div className={styles.evidence}><span>WHAT TO LOOK FOR</span>{evidence}</div></article>)}</div>
        <div className={styles.expertise}><h3>Help with the fiddly parts</h3><p>A lid that sticks, a loose connection, a print that needs support. We work through the problem with participants: check the measurements, follow the wires and try one change at a time.</p><a href="#enquire">Tell us what you would like to make ↗</a></div>
    </section>
}
