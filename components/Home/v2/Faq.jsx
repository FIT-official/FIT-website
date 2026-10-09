import { siteFacts } from '@/lib/home/siteFacts'
import { jsonLdString } from '@/lib/jsonLd'
import styles from './home.module.css'

// Answers are tied to code-backed public facts; no turnaround, tax or PO claim.
export function homeFaqs(facts) {
    return [
        facts.printFileTypes?.length && { question: 'Which files can I send for a print quote?', answer: `The print request form accepts ${facts.printFileTypes.join(', ')} files. Upload your model at the start of your request.` },
        facts.deliveryOptions?.length && { question: 'Can I choose delivery or self-collection?', answer: `Delivery options are ${facts.deliveryOptions.join(', ')}. ${facts.deliveryOffer || ''}`.trim() },
        facts.bulkQuotePath && { question: 'How do I get a bulk filament quote?', answer: 'Use the bulk filament enquiry form to select materials, colours and quantities. FIT confirms the final quotation.' },
        facts.cardPayments === true && { question: 'Can I pay by card?', answer: 'Card payment is available at checkout through Stripe.' },
    ].filter(Boolean)
}

export default function Faq({ facts = siteFacts }) {
    const questions = homeFaqs(facts)
    if (questions.length < 3) return null
    const schema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: questions.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) }
    return <section className={styles.section} aria-labelledby="home-faq">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(schema) }} />
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>A little help getting started</p><h2 id="home-faq">Good to know</h2></div></div>
        <div className={styles.faq}>{questions.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>
    </section>
}
