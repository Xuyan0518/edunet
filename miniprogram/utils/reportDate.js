const pad = (value) => String(value).padStart(2, '0');

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date;

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const dateOnly = new Date(year, month - 1, day, 0, 0, 0);
    return Number.isNaN(dateOnly.getTime()) ? null : dateOnly;
  }
  return null;
};

const formatReportDateTime = (value) => {
  const date = toDate(value);
  if (!date) return '';
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

module.exports = {
  formatReportDateTime,
};
