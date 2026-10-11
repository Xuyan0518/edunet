// Calendar arithmetic mirrors mini program Sunday-based reporting; business today is China time.
export function isBusinessDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const [year, month, day] = value.split('-').map(Number);
    return year >= 2000 && year <= 2100 && new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}
export function businessToday(now = new Date()): string {
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = (type: string) => parts.find(p => p.type === type)!.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}
export function addCalendarDays(value: string, days: number): string {
    if (!isBusinessDate(value))
        throw new Error('Invalid business date');
    const date = new Date(`${value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
export function reportingWeek(value: string) {
    if (!isBusinessDate(value))
        throw new Error('Invalid business date');
    const start = addCalendarDays(value, -new Date(`${value}T12:00:00Z`).getUTCDay());
    return { start, end: addCalendarDays(start, 6) };
}
