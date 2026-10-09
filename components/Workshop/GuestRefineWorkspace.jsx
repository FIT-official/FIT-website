import GuestIdeaReading from './GuestIdeaReading'
import GuestRefinementForm from './GuestRefinementForm'
import styles from './GuestClassroom.module.css'

export default function GuestRefineWorkspace({ group, lesson, onRefresh }) {
    return <section className="mt-8" aria-label="Refine your two ideas">
        <h2 className="text-3xl font-bold">Read your ideas, then improve them</h2>
        <p className="mt-3">Look at both pictures and descriptions. Write your changes beside them or below.</p>
        <nav className={styles.refineLinks} aria-label="Move between your ideas and writing">
            <a className="formWhiteButton" href="#refine-idea-1">Read Idea 1</a>
            <a className="formWhiteButton" href="#refine-idea-2">Read Idea 2</a>
            <a className="formBlackButton" href="#refine-writing">Write your changes</a>
        </nav>
        <div className={styles.columns}>
            <div className={styles.idea}>
                {['1', '2'].map(idea => <section key={idea} id={'refine-idea-' + idea} className={styles.refineIdea}>
                    <GuestIdeaReading group={group} idea={idea} />
                    <a className="underline inline-block mt-4" href="#refine-writing">Write your changes</a>
                </section>)}
            </div>
            <div id="refine-writing" className={styles.refineWriting}>
                <h2 className="text-2xl font-bold">Your changes</h2>
                <nav className={styles.refineLinks} aria-label="Read an idea again"><a className="underline" href="#refine-idea-1">Back to Idea 1</a><a className="underline" href="#refine-idea-2">Back to Idea 2</a></nav>
                <GuestRefinementForm key={lesson.seat} lesson={lesson} onRefresh={onRefresh} />
            </div>
        </div>
    </section>
}
