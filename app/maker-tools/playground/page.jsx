import MakerPlayground from '@/components/MakerPlayground/MakerPlayground'

export const metadata = {
  title: 'Maker coding playground | Fix It Today',
  description: 'Learn Arduino and ESP32 coding with annotated sketches, local drafts and a bounded educational logic preview.',
  alternates: { canonical: '/maker-tools/playground' },
}

export default function PlaygroundPage() { return <MakerPlayground /> }
