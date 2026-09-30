import styles from './ProgrammeEvidence.module.css'
const outcomes = [
    ['01', 'Design with a purpose', 'Turn a real need into dimensions, a circuit or a sequence of actions. Explain what the first version should do.', 'A sketch, model or circuit plan'],
    ['02', 'Make the idea work', 'Connect digital design to physical parts. Check fit, trace an input through code and test how an output responds.', 'A prototype with a testable function'],
    ['03', 'Use evidence to improve', 'Measure what happened, change one variable and compare versions. Explain the next design decision with evidence.', 'A test record and a reasoned revision'],
]
export default function LearningOutcomes({ company = false }) {
    return <section className={styles.section} aria-labelledby="learning-outcomes">
        <p className={styles.eyebrow}>THE LEARNING IS IN THE MAKING</p><h2 id="learning-outcomes">A build is the beginning.<br /><em>Understanding is the outcome.</em></h2><p className={styles.intro}>{company ? 'A useful workshop connects a new skill to a task your team can explain, test and improve.' : 'We plan around what students should be able to explain and demonstrate, then choose the tools and project to match.'} These are programme goals; the scope is agreed for each group.</p>
        <div className={styles.cards}>{outcomes.map(([number, title, description, evidence]) => <article key={number} className={styles.outcome}><span className={styles.number}>{number}</span><h3>{title}</h3><p>{description}</p><div className={styles.evidence}><span>WHAT TO LOOK FOR</span>{evidence}</div></article>)}</div>
        <div className={styles.expertise}><h3>From file to functioning part</h3><p>CAD dimensions. Print orientation. Material choice. Sensor thresholds. Wiring and debugging. We connect these decisions within a project, so participants can see why each one matters.</p><a href="#enquire">Build a programme around your goals ↗</a></div>
    </section>
}
