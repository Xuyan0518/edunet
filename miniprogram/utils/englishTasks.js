const DEFAULT_ENGLISH_TASKS = [
  {
    id: "editing",
    key: "editing",
    chineseName: "改错",
    englishName: "Editing",
    displayName: "改错 (Editing)",
    weeklyTargetCount: 5,
    enabled: true,
    enabledFields: ["practiceCount", "score", "problems"],
    sortOrder: 0,
  },
  {
    id: "reading",
    key: "reading",
    chineseName: "阅读理解",
    englishName: "Reading",
    displayName: "阅读理解 (Reading)",
    weeklyTargetCount: 5,
    enabled: true,
    enabledFields: ["practiceCount", "score", "problems"],
    sortOrder: 1,
  },
  {
    id: "grammar",
    key: "grammar",
    chineseName: "语法",
    englishName: "Grammar",
    displayName: "语法 (Grammar)",
    weeklyTargetCount: 5,
    enabled: true,
    enabledFields: ["practiceCount", "score", "problems"],
    sortOrder: 2,
  },
  {
    id: "vocab",
    key: "vocab",
    chineseName: "词汇",
    englishName: "Vocab",
    displayName: "词汇 (Vocab)",
    weeklyTargetCount: 50,
    enabled: true,
    enabledFields: ["practiceCount"],
    sortOrder: 3,
  },
  {
    id: "recitation",
    key: "recitation",
    chineseName: "单词句子背诵",
    englishName: "Recitation",
    displayName: "单词句子背诵 (Recitation)",
    weeklyTargetCount: 5,
    enabled: true,
    enabledFields: ["practiceCount", "problems"],
    sortOrder: 4,
  },
  {
    id: "essay",
    key: "essay",
    chineseName: "作文",
    englishName: "Essay",
    displayName: "作文 (Essay)",
    weeklyTargetCount: 1,
    enabled: true,
    enabledFields: ["score", "problems"],
    sortOrder: 5,
  },
];

const TASK_TYPE_PRESETS = [
  { key: "editing", chineseName: "改错", englishName: "Editing" },
  { key: "reading", chineseName: "阅读理解", englishName: "Reading" },
  { key: "grammar", chineseName: "语法", englishName: "Grammar" },
  { key: "vocab", chineseName: "词汇", englishName: "Vocab" },
  { key: "recitation", chineseName: "单词句子背诵", englishName: "Recitation" },
  { key: "essay", chineseName: "作文", englishName: "Essay" },
  { key: "listening", chineseName: "听力", englishName: "Listening" },
  { key: "oral", chineseName: "口语", englishName: "Oral" },
  { key: "dictation", chineseName: "默写", englishName: "Dictation" },
  { key: "sentence_patterns", chineseName: "句型", englishName: "Sentence Patterns" },
  { key: "custom", chineseName: "其他", englishName: "Custom" },
];

const FIELD_KEYS = ["practiceCount", "score", "problems"];

const trimText = (value, max = 120) => String(value == null ? "" : value).trim().slice(0, max);

const normalizeEnabledFields = (fields) => {
  const arr = Array.isArray(fields) ? fields : [];
  const out = [];
  arr.forEach((item) => {
    if (FIELD_KEYS.includes(item) && !out.includes(item)) out.push(item);
  });
  return out.length ? out : ["practiceCount", "score", "problems"];
};

const normalizeTask = (task, index = 0) => {
  const chineseName = trimText(task?.chineseName, 80);
  const englishName = trimText(task?.englishName, 80);
  const autoDisplayName = chineseName && englishName
    ? `${chineseName} (${englishName})`
    : (chineseName || englishName);
  const displayName = trimText(task?.displayName, 120) || autoDisplayName;
  const key = trimText(task?.key, 64).toLowerCase().replace(/[^a-z0-9_-]/g, "_") || `custom_${index + 1}`;
  const id = trimText(task?.id, 64).replace(/[^a-zA-Z0-9_-]/g, "") || `task_${index + 1}`;
  let weeklyTargetCount = Number(task?.weeklyTargetCount || 0);
  if (!Number.isFinite(weeklyTargetCount) || weeklyTargetCount < 0) weeklyTargetCount = 0;
  if (weeklyTargetCount > 500) weeklyTargetCount = 500;
  return {
    id,
    key,
    chineseName,
    englishName,
    displayName: displayName || chineseName || englishName || key,
    weeklyTargetCount: Math.floor(weeklyTargetCount),
    enabled: task?.enabled !== false,
    enabledFields: normalizeEnabledFields(task?.enabledFields),
    sortOrder: Number.isFinite(Number(task?.sortOrder)) ? Number(task.sortOrder) : index,
  };
};

const normalizeEnglishTaskConfig = (tasks) => {
  if (!Array.isArray(tasks) || !tasks.length) {
    return DEFAULT_ENGLISH_TASKS.map((item) => ({ ...item, enabledFields: [...item.enabledFields] }));
  }
  const out = tasks
    .map((task, index) => normalizeTask(task, index))
    .filter((task) => task.displayName);
  out.sort((a, b) => a.sortOrder - b.sortOrder);
  return out.map((task, index) => ({ ...task, sortOrder: index }));
};

const getCanonicalTaskKeys = () => ["editing", "reading", "grammar", "vocab", "recitation", "essay"];

module.exports = {
  DEFAULT_ENGLISH_TASKS,
  TASK_TYPE_PRESETS,
  FIELD_KEYS,
  normalizeEnglishTaskConfig,
  getCanonicalTaskKeys,
};
