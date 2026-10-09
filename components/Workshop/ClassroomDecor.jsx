import Image from 'next/image'
import styles from './ClassroomDesign.module.css'

export function ClassBrand({ teacher = false }) {
    return <div className={styles.brand}><Image src="/logo-mark.svg" width={32} height={32} alt="FIT" /><span>MAKE • SHARE • IMPROVE<span>{teacher ? 'Your teaching space' : 'Your ideas start here'}</span></span></div>
}

// Original small line icons. Decorative: the visible activity name labels each control.
export function ClassIcon({ kind }) {
    const paths = {
        PRESENT: <><path d="m12 3 2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5L12 3Z" /><path d="M20 3v4M18 5h4M4 18v4M2 20h4" /></>,
        FEEDBACK: <><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-6 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M7 9h10M7 13h6" /></>,
        REFINE: <><path d="m5 15 11-11 4 4L9 19l-6 2 2-6ZM13 7l4 4M5 15l4 4" /><path d="M15 20h6" /></>,
        TINKERCAD: <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v10l9 5 9-5V8M12 13v10" /></>,
        ARROW: <><path d="M4 12h16M14 6l6 6-6 6" /></>,
        CHECK: <path d="m5 12 4 4L19 6" />,
    }
    return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[kind] || paths.PRESENT}</svg>
}

export function IdeaPal() {
    return <svg className={styles.pal} viewBox="0 0 168 138" preserveAspectRatio="xMidYMid meet" fill="none" aria-hidden="true" focusable="false">
        <path d="m26 29-8-7M45 18l-2-10M17 47 7 48M137 24l7-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <g transform="rotate(10 114 86)">
            <rect x="76" y="48" width="76" height="76" rx="21" fill="white" stroke="currentColor" strokeWidth="2.5" />
            <circle cx="122" cy="82" r="1.8" fill="currentColor" />
            <circle cx="138" cy="82" r="1.8" fill="currentColor" />
            <path d="M121 98q9 9 18 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </g>
        <g transform="rotate(-10 70 73)">
            <rect x="29" y="32" width="82" height="82" rx="23" fill="#ffdd00" stroke="currentColor" strokeWidth="2.5" />
            <circle cx="54" cy="65" r="2" fill="currentColor" />
            <circle cx="82" cy="65" r="2" fill="currentColor" />
            <path d="M54 80q14 14 29 0" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </g>
        <path d="m120 7 3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" fill="currentColor" />
    </svg>
}
