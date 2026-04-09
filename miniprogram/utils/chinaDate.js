const pad = (num) => String(num).padStart(2, "0");

const toChinaDate = (date = new Date()) => {
  const chinaOffset = 8 * 60;
  const localOffset = -date.getTimezoneOffset();
  const diff = chinaOffset - localOffset;
  return new Date(date.getTime() + diff * 60000);
};

const formatChinaDate = (date = new Date()) => {
  const d = toChinaDate(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatChinaDateTime = (date = new Date()) => {
  const d = toChinaDate(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

module.exports = { formatChinaDate, formatChinaDateTime };
