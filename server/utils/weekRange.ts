const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const parseIsoDate = (value: string): Date | null => {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value ? date : null;
};

export const isCanonicalWeeklyRange = (weekStarting: string, weekEnding: string): boolean => {
  const start = parseIsoDate(weekStarting);
  const end = parseIsoDate(weekEnding);
  if (!start || !end || start.getUTCDay() !== 0) return false;
  const expectedEnd = new Date(start);
  expectedEnd.setUTCDate(expectedEnd.getUTCDate() + 6);
  return expectedEnd.toISOString().slice(0, 10) === weekEnding;
};
