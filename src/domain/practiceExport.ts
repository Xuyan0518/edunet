import { z } from 'zod';
import { businessToday, isBusinessDate } from './businessDates';

export function pastMonthRange(endDate = businessToday()) {
  if (!isBusinessDate(endDate)) throw new Error('Invalid end date');
  const [year, month, day] = endDate.split('-').map(Number);
  const previousMonthEnd = new Date(Date.UTC(year, month - 1, 0));
  const start = new Date(Date.UTC(year, month - 2, Math.min(day, previousMonthEnd.getUTCDate())));
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

const date = z.preprocess(value => value === '' ? undefined : value,
  z.string().refine(isBusinessDate, 'Use a valid date in YYYY-MM-DD format').optional());
const dates = { startDate: date, endDate: date };
const requestSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('selected'), studentIds: z.array(z.string().uuid()).nonempty(), ...dates }),
  z.object({ scope: z.literal('grade'), grade: z.string().trim().min(1).max(100), ...dates }),
  z.object({ scope: z.literal('all'), ...dates }),
]).transform(value => {
  const range = pastMonthRange(value.endDate);
  return { ...value, startDate: value.startDate ?? range.startDate, endDate: range.endDate,
    ...(value.scope === 'selected' ? { studentIds: [...new Set(value.studentIds)] } : {}) };
}).refine(value => value.startDate <= value.endDate, { message: 'Start date must be on or before end date', path: ['startDate'] });

export function parsePracticeExportRequest(input: unknown) {
  return requestSchema.safeParse(input);
}
export type PracticeExportRequest = z.output<typeof requestSchema>;
