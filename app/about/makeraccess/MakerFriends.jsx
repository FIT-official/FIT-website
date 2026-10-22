import styles from './page.module.css'

// Decorative maker characters. These illustrate components, not a particular machine or stock list.
export default function MakerFriends() {
    return <svg className={styles.friends} viewBox="0 0 600 480" fill="none" aria-hidden="true" focusable="false">
        <ellipse cx="309" cy="410" rx="205" ry="21" fill="#23231E" opacity=".08" />
        <path d="M96 218C55 205 70 145 121 154M476 118c52-36 85 23 57 52M116 360c-39 21-61-9-47-37" stroke="#6F947D" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="5 9" />
        <g className={styles.spark}><path d="m458 54 5 14 14 5-14 5-5 14-5-14-14-5 14-5 5-14Z" fill="#F8C74D" stroke="#25251F" strokeWidth="2.5" /><path d="m109 91 3 9 10 3-10 4-3 9-4-9-9-4 9-3 4-9Z" fill="#BFA7EA" stroke="#25251F" strokeWidth="2" /></g>
        <g className={styles.boardFriend} stroke="#25251F" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m217 321-18 64-24 7m171-64 13 58 26 2" />
            <path d="M204 235c-35 3-50-10-57-28" />
            <g className={styles.wave}><path d="m147 207-14-24m14 24-2-30m2 30 10-24" /><circle cx="147" cy="208" r="10" fill="#B9DDC1" /></g>
            <path d="M388 237c35 1 52-20 58-37m0 0 14-11m-14 11 2-18" />
            <rect x="190" y="109" width="211" height="239" rx="33" fill="#74AB8E" transform="rotate(-7 190 109)" />
            <rect x="180" y="96" width="211" height="239" rx="33" fill="#BDE3CA" transform="rotate(-7 180 96)" />
            <g transform="rotate(-7 180 96)">
                <path d="M198 139h30m-30 30h30m-30 30h30m-30 30h30m125-90h20m-20 30h20m-20 30h20m-20 30h20" stroke="#E7B74A" strokeWidth="9" />
                <rect x="230" y="143" width="111" height="110" rx="23" fill="#FAF8ED" />
                <g className={styles.eyes}><ellipse cx="263" cy="187" rx="5" ry="7" fill="#25251F" stroke="none" /><ellipse cx="309" cy="187" rx="5" ry="7" fill="#25251F" stroke="none" /></g>
                <path d="M274 208q12 13 24-1" />
                <ellipse cx="250" cy="205" rx="8" ry="5" fill="#EBAF97" stroke="none" /><ellipse cx="321" cy="205" rx="8" ry="5" fill="#EBAF97" stroke="none" />
                <path d="M254 111v17m24-18v17m24-18v17m24-18v17M249 271v20h21m13-20v35m27-35v20h28" stroke="#6FAD88" strokeWidth="3" />
                <circle cx="215" cy="121" r="5" fill="#F8C74D" /><circle cx="361" cy="309" r="5" fill="#F8C74D" />
                <rect x="210" y="292" width="27" height="18" rx="4" fill="#F8C74D" /><rect x="330" y="112" width="39" height="17" rx="4" fill="#F8C74D" />
            </g>
        </g>
        <g className={styles.spoolFriend} stroke="#25251F" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m433 353-5 40-18 9m57-52 15 35 18 4" />
            <ellipse cx="459" cy="303" rx="68" ry="77" transform="rotate(14 459 303)" fill="#AA91D2" />
            <path d="m425 239-34 3-22 121 41 10" fill="#B9A1DE" />
            <ellipse cx="411" cy="302" rx="62" ry="77" transform="rotate(14 411 302)" fill="#D4C2ED" />
            <ellipse cx="411" cy="302" rx="41" ry="54" transform="rotate(14 411 302)" fill="#F2EAF9" />
            <ellipse cx="411" cy="302" rx="13" ry="20" transform="rotate(14 411 302)" fill="#AA91D2" />
            <path d="M446 280q7-9 13 0m5 14q7-9 13 0m-28 10q4 10 12 8" />
            <path d="M472 357c52 24 45 56 10 60" stroke="#9A7EC2" />
        </g>
        <g className={styles.ledFriend} stroke="#25251F" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m117 321-6 69-15 10m40-75 7 52 15 6" />
            <path d="M90 306v-36a35 35 0 0 1 70 0v36" fill="#F2A18C" />
            <rect x="82" y="301" width="86" height="19" rx="9" fill="#EFBE55" />
            <path d="M102 271q1-15 15-20" stroke="white" strokeWidth="5" />
            <circle cx="114" cy="282" r="3" fill="#25251F" stroke="none" /><circle cx="140" cy="282" r="3" fill="#25251F" stroke="none" /><path d="M120 293q6 5 11 0" strokeWidth="2.5" />
            <path d="m91 232-11-9m63 2 9-12m-30 12-1-15" stroke="#D69927" strokeWidth="3" />
        </g>
    </svg>
}
