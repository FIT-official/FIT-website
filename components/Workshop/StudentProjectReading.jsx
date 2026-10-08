import Image from 'next/image'
export default function StudentProjectReading({ group }) {
    const reading = group.reading
    return <article className="px-5 py-8 max-w-6xl mx-auto" aria-label={'Group ' + group.number + ' complete project reading'}>
        <h2 className="text-3xl">Group {group.number}: two project ideas</h2><p className="mt-3">Read the original idea and the suggested changes. Choose one idea for your three feedback answers.</p><p className="border rounded-lg p-3 mt-4">These drawings explain ideas to discuss. The designs still need to be built and tested.</p>
        <div className="grid lg:grid-cols-2 gap-6 mt-6">{reading.ideas.map((idea, index) => <section key={idea.reviewedImageKey} className="border rounded-xl p-5" aria-labelledby={'reading-' + group.id + '-' + index}>
            <h3 id={'reading-' + group.id + '-' + index} className="text-2xl">Idea {index + 1}: {idea.title}</h3>
            <h4 className="font-semibold mt-4">The problem and who it helps</h4><p className="mt-2 leading-relaxed">{idea.problemContext}</p>
            <h4 className="font-semibold mt-4">Original idea</h4><p className="mt-2 leading-relaxed">{idea.originalIntent}</p>
            <h4 className="font-semibold mt-4">Suggested improvement</h4><p className="mt-2 leading-relaxed">{idea.recommendedRefinement}</p>
            <h4 className="font-semibold mt-4">How it works</h4><p className="mt-2 leading-relaxed">{idea.studentExplanation}</p>
            {idea.auditUnresolved && <p className="border rounded p-3 mt-3"><strong>Unresolved drawing check:</strong> {idea.auditUnresolved}</p>}
            <ol className="mt-4 space-y-3">{idea.mechanismSteps.map((step, number) => <li key={step} className="border rounded-lg p-3"><strong>Step {number + 1}.</strong> {step}</li>)}</ol>
            {(idea.illustrations || []).filter(image => image.approved && /^\/workshop\/models\/[a-z0-9_-]+\.(png|jpe?g|webp)$/.test(image.src) && !/nygh-printed-mechanism/.test(image.src)).map(image => <figure key={image.src} className="mt-4"><Image src={image.src} alt={image.alt} width={image.width} height={image.height} className="w-full h-auto" /><figcaption className="text-sm mt-2">{image.caption}</figcaption></figure>)}
            {!idea.illustrations?.some(image => image.approved) && <p className="border rounded p-3 mt-4">Illustrations pending review. Use the written mechanism sequence for now.</p>}
            <details className="mt-3"><summary>Proposed storyboard captions — images not yet approved</summary>{idea.proposedIllustrations.map(image => <p className="mt-2" key={image.caption}>{image.caption} <span className="text-sm">{image.status}</span></p>)}</details>
            <h4 className="font-semibold mt-4">Parts and safe testing</h4><ul className="list-disc pl-5 mt-2">{idea.parts.map(part => <li key={part}>{part}</li>)}</ul><p className="mt-3 leading-relaxed">{idea.designSafeguards}</p>
            <h4 className="font-semibold mt-4">What to test next</h4><p className="mt-2 leading-relaxed">{idea.nextTest}</p>
            {idea.statistics.length > 0 && <section className="border rounded-lg p-3 mt-4"><h4 className="font-semibold">Relevant background evidence</h4>{idea.statistics.map(statistic => <div className="mt-3" key={statistic.url}><p>{statistic.text}</p><p className="text-sm mt-2">{statistic.scope}</p><a className="underline block mt-2" href={statistic.url} target="_blank" rel="noreferrer">{statistic.sourceTitle}</a><p className="text-sm">Source checked {statistic.checkedDate}</p></div>)}</section>}
        </section>)}</div>
        <section className="border rounded-xl p-5 mt-6"><h3 className="text-xl">Three feedback questions</h3><ol className="list-decimal pl-5 mt-3 space-y-3">{reading.feedbackQuestions.map(question => <li key={question}>{question}</li>)}</ol></section>
    </article>
}
