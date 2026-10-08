import Link from 'next/link'
import Image from 'next/image'
import LocalWorksheet from './LocalWorksheet'
import StudentProjectReading from './StudentProjectReading'
import PupilIdeaCopy from './PupilIdeaCopy'
export default function ReviewedGroupPage({ group, classroom = false }) {
    if (classroom && group.reading) return <StudentProjectReading group={group} />
    const Container = classroom ? 'article' : 'main', Heading = classroom ? 'h2' : 'h1'
    return <Container className="px-5 md:px-10 py-12 max-w-6xl mx-auto">
        <nav aria-label="Workshop navigation" className="flex flex-wrap gap-4 print:hidden"><Link href={'/workshop/' + group.id + '/classroom'} className="underline">Open Group {group.number} classroom</Link><Link href="/workshop" className="underline">All groups</Link><Link href="/blog/design-thinking-workshop" className="underline">Workshop guide</Link></nav>
        <p className="mt-8 text-sm">Friday 9 October 2026 · 30 minutes</p>
        <Heading className="text-3xl md:text-4xl mt-2">Group {group.number}: compare your two ideas</Heading>
        <p className="mt-4 max-w-3xl">Choose one difficulty to help with. Compare both ideas, make one useful change and explain a fair test. The model examples show design proposals, not equipment proven to work.</p>
        <div className="grid lg:grid-cols-2 gap-6 mt-8">{group.ideas.map((idea, index) => <section key={idea.title} className="border border-borderColor rounded-xl p-5 md:p-7" aria-labelledby={'idea-' + group.id + '-' + (index + 1)}>
            <h2 id={'idea-' + group.id + '-' + (index + 1)} className="text-2xl">Idea {index + 1}: {idea.title}</h2>
            {idea.reviewNotice && <p className="mt-3 border rounded p-3">{idea.reviewNotice}</p>}
            {group.models[index] ? <figure className="mt-5"><Image src={group.models[index].src} alt={group.models[index].alt} width={group.models[index].width} height={group.models[index].height} sizes="(max-width:1023px) 90vw, 45vw" className="w-full h-auto rounded-lg" /><figcaption className="text-sm mt-3">{group.models[index].caption}</figcaption></figure> : <p className="mt-5 border rounded p-4">Illustration pending review. Use the original idea and written design proposals below for this activity.</p>}
            {idea.pupilCopy ? <PupilIdeaCopy copy={idea.pupilCopy} /> : <><h3 className="font-semibold mt-5">Original problem</h3><p className="mt-2">{idea.originalProblem}</p>
            <h3 className="font-semibold mt-5">Original idea</h3><p className="mt-2">{idea.originalSolution}</p>
            <h3 className="font-semibold mt-5">Clearer problem</h3><p className="mt-2">{idea.improvedProblem}</p><p className="text-sm mt-2">{idea.reason}</p>
            <h3 className="font-semibold mt-5">Changes to investigate</h3><ul className="list-disc pl-5 space-y-2 mt-2">{idea.changes.map(change => <li key={change.change}><strong>{change.change}.</strong> {change.why}</li>)}</ul>
            {idea.proposalParts && <><h3 className="font-semibold mt-5">Parts to investigate</h3><ul className="list-disc pl-5 mt-2">{idea.proposalParts.map(part => <li key={part}>{part}</li>)}</ul></>}
            <h3 className="font-semibold mt-5">A model you can make</h3><p className="mt-2">{idea.howItWorks || idea.originalSolution}</p>
            {idea.printedParts && <><p className="mt-2"><strong>Printed structure:</strong> {idea.printedParts.join('; ')}.</p><p className="mt-2"><strong>Supplied equipment:</strong> {idea.suppliedParts.join('; ')}.</p></>}
            <p className="text-sm mt-3">Start with a non-working shape model of the reviewed design. Label the parts, show how they connect and explain which equipment is still needed. A printed shape does not prove the proposed functions.</p>
            <h3 className="font-semibold mt-5">Safe prototype boundary</h3><p className="mt-2">{idea.boundary}</p>
            <h3 className="font-semibold mt-5">Compare fairly</h3><ol className="list-decimal pl-5 space-y-2 mt-2">{idea.test.map(step => <li key={step}>{step}</li>)}</ol>{idea.measure && <p className="mt-3">{idea.measure}</p>}</>}
        </section>)}</div>
        <h2 className="text-2xl mt-10">Your three activities</h2>
        <div className="grid md:grid-cols-3 gap-5 mt-5">{group.activities.map((activity, index) => <section key={activity.title} className="border border-borderColor rounded-xl p-5">
            <p className="text-sm">Activity {index + 1} · {activity.minutes} minutes</p><h3 className="text-xl mt-2">{activity.title}</h3><p className="mt-3">{activity.goal}</p>
            <ol className="list-decimal pl-5 mt-4 space-y-2">{activity.steps.map(step => <li key={step}>{step}</li>)}</ol>
            <p className="mt-4 text-sm"><strong>Check:</strong> {activity.successCheck}</p>
        </section>)}</div>
        <section className="mt-10 border border-borderColor rounded-xl p-5 md:p-7"><h2 className="text-2xl">Start your shape model</h2>
            <ol className="list-decimal pl-5 space-y-2 mt-4"><li>Choose one reviewed idea and sketch its main parts.</li><li>In Tinkercad, use boxes or cylinders for the structure. Set the sizes from measurements and label supplied equipment separately.</li><li>Show one useful change, check how parts would connect and save a screenshot of your model for your teacher.</li></ol>
            <p className="mt-3 text-sm">Use your teacher’s assigned workspace. Do not enter class joining details or account information in your answers. Ask your teacher before printing, powering or physically testing equipment.</p>
        </section>
        {!classroom && <details className="mt-8"><summary>Optional presentation preparation (saved only on this browser)</summary><LocalWorksheet key={group.id} group={group.id} fields={group.worksheet.fields} ideas={group.ideas} /></details>}
        <nav aria-label="Other groups" className="flex flex-wrap gap-3 mt-10 print:hidden">{Array.from({length:10},(_,i)=>i+1).filter(n=>n!==group.number).map(n=><Link key={n} href={'/workshop/g'+n} className="underline">Group {n}</Link>)}</nav>
    </Container>
}
