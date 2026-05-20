const { formatSubjectName } = require('./displayName');

const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const includesAny = (value, keywords) => keywords.some((key) => value.includes(key));

const hasLatin = (value = "") => /[A-Za-z]/.test(String(value));

const withEnglishLine = (zhName, rawName) => {
  const zh = String(zhName || "").trim();
  const raw = String(rawName || "").trim();
  if (!zh) return raw || "未命名科目";
  if (!raw || zh === raw) return zh;
  if (!hasLatin(raw)) return zh;
  return zh;
};

const resolveFromNormalized = (normalized) => {
  if (!normalized) return '';

  if (includesAny(normalized, ['additional mathematics', 'a math', 'amath', '高数'])) return '高等数学';
  if (includesAny(normalized, ['mathematics', ' math', '数学'])) return '数学';
  if (includesAny(normalized, ['social studies', 'social study', '社会研究'])) return '社会研究';
  if (includesAny(normalized, ['pure chemistry', 'chemistry', '化学'])) return '化学';
  if (includesAny(normalized, ['pure physics', 'physics', '物理'])) return '物理';
  if (includesAny(normalized, ['pure biology', 'biology', '生物'])) return '生物';
  if (includesAny(normalized, ['english', '英语', '英文'])) return '英文';
  if (includesAny(normalized, ['chinese', '华文', '中文'])) return '华文';
  if (includesAny(normalized, ['history', '历史'])) return '历史';
  if (includesAny(normalized, ['geography', '地理'])) return '地理';
  if (includesAny(normalized, ['literature', '文学'])) return '文学';
  if (includesAny(normalized, ['science', '科学'])) return '科学';
  if (includesAny(normalized, ['accounting', 'poa', '会计'])) return '会计';
  if (includesAny(normalized, ['economics', '经济'])) return '经济';
  if (includesAny(normalized, ['computing', 'computer science', '计算机'])) return '计算机';
  return '';
};

const getSubjectDisplayName = (subjectName) => {
  const raw = String(subjectName || '').trim();
  if (!raw) return '未命名科目';

  const direct = resolveFromNormalized(normalize(raw));
  if (direct) return withEnglishLine(direct, raw);

  const mapped = formatSubjectName(raw);
  if (mapped && mapped !== raw) {
    const mappedResolved = resolveFromNormalized(normalize(mapped));
    if (mappedResolved) return withEnglishLine(mappedResolved, raw);
    return mapped;
  }

  return raw;
};

module.exports = {
  getSubjectDisplayName,
};
