// Verified 1 October 2026 against the Ministry of Manpower calendar, including
// Monday holidays observed after Sunday holidays. Unknown years fail closed.
export const SG_HOLIDAY_SOURCE = 'https://www.mom.gov.sg/employment-practices/public-holidays';
export const SG_HOLIDAY_LAST_VERIFIED = '2026-10-01';
const holidays = {
    2026: new Set(['2026-01-01', '2026-02-17', '2026-02-18', '2026-03-21', '2026-04-03',
        '2026-05-01', '2026-05-27', '2026-05-31', '2026-06-01', '2026-08-09', '2026-08-10',
        '2026-11-08', '2026-11-09', '2026-12-25']),
    2027: new Set(['2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-03-10',
        '2027-03-26', '2027-05-01', '2027-05-17', '2027-05-20', '2027-08-09', '2027-10-28', '2027-12-25']),
};

export function addSingaporeWorkingDays(confirmedAt, count) {
    if (!confirmedAt || !Number.isSafeInteger(count) || count < 1 || count > 30) return null;
    const instant = new Date(confirmedAt);
    if (!Number.isFinite(instant.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(instant);
    const value = type => parts.find(part => part.type === type)?.value;
    const date = new Date(`${value('year')}-${value('month')}-${value('day')}T00:00:00Z`);
    if (!holidays[date.getUTCFullYear()]) return null;
    // Paid/confirmed day is day zero; count starts on the next working day.
    for (let remaining = count; remaining > 0;) {
        date.setUTCDate(date.getUTCDate() + 1);
        const yearHolidays = holidays[date.getUTCFullYear()];
        if (!yearHolidays) return null;
        const day = date.getUTCDay();
        if (day !== 0 && day !== 6 && !yearHolidays.has(date.toISOString().slice(0, 10))) remaining -= 1;
    }
    return date.toISOString().slice(0, 10);
}
