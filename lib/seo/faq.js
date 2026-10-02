export function faqJsonLd(items) {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map(({ question, answer }) => ({
            '@type': 'Question', name: question,
            acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
    }
}
