import { INPUT_LIMITS, parseFiniteInteger, trimString } from './inputValidation';

export const ENGLISH_TASK_FIELD_KEYS = ['practiceCount', 'score', 'problems'] as const;
export type EnglishTaskFieldKey = (typeof ENGLISH_TASK_FIELD_KEYS)[number];

export type EnglishTaskConfigItem = {
  id: string;
  key: string;
  chineseName: string;
  englishName: string;
  displayName: string;
  weeklyTargetCount: number;
  enabled: boolean;
  enabledFields: EnglishTaskFieldKey[];
  sortOrder: number;
};

export const DEFAULT_ENGLISH_TASKS: EnglishTaskConfigItem[] = [
  {
    id: 'editing',
    key: 'editing',
    chineseName: '改错',
    englishName: 'Editing',
    displayName: '改错 (Editing)',
    weeklyTargetCount: 5,
    enabled: true,
    enabledFields: ['practiceCount', 'score', 'problems'],
    sortOrder: 0,
  },
  {
    id: 'reading',
    key: 'reading',
    chineseName: '阅读理解',
    englishName: 'Reading',
    displayName: '阅读理解 (Reading)',
    weeklyTargetCount: 5,
    enabled: true,
    enabledFields: ['practiceCount', 'score', 'problems'],
    sortOrder: 1,
  },
  {
    id: 'grammar',
    key: 'grammar',
    chineseName: '语法',
    englishName: 'Grammar',
    displayName: '语法 (Grammar)',
    weeklyTargetCount: 5,
    enabledFields: ['practiceCount', 'score', 'problems'],
    enabled: true,
    sortOrder: 2,
  },
  {
    id: 'vocab',
    key: 'vocab',
    chineseName: '词汇',
    englishName: 'Vocab',
    displayName: '词汇 (Vocab)',
    weeklyTargetCount: 50,
    enabled: true,
    enabledFields: ['practiceCount'],
    sortOrder: 3,
  },
  {
    id: 'recitation',
    key: 'recitation',
    chineseName: '单词句子背诵',
    englishName: 'Recitation',
    displayName: '单词句子背诵 (Recitation)',
    weeklyTargetCount: 5,
    enabled: true,
    enabledFields: ['practiceCount', 'problems'],
    sortOrder: 4,
  },
  {
    id: 'essay',
    key: 'essay',
    chineseName: '作文',
    englishName: 'Essay',
    displayName: '作文 (Essay)',
    weeklyTargetCount: 1,
    enabled: true,
    enabledFields: ['score', 'problems'],
    sortOrder: 5,
  },
];

const makeDisplayName = (zh: string, en: string) => {
  const left = trimString(zh);
  const right = trimString(en);
  if (left && right) return `${left} (${right})`;
  return left || right;
};

const normalizeEnabledFields = (raw: unknown): EnglishTaskFieldKey[] => {
  const inArr = Array.isArray(raw) ? raw : [];
  const unique: EnglishTaskFieldKey[] = [];
  for (const item of inArr) {
    if (ENGLISH_TASK_FIELD_KEYS.includes(item as EnglishTaskFieldKey)) {
      const key = item as EnglishTaskFieldKey;
      if (!unique.includes(key)) unique.push(key);
    }
  }
  return unique.length ? unique : ['practiceCount', 'score', 'problems'];
};

const clampWeeklyTarget = (value: unknown) => {
  const n = parseFiniteInteger(value);
  if (n === null) return 0;
  if (n < 0) return 0;
  if (n > INPUT_LIMITS.englishVocabCountMax) return INPUT_LIMITS.englishVocabCountMax;
  return n;
};

const normalizeTaskId = (value: unknown, fallback: string) => {
  const raw = trimString(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return raw || fallback;
};

const normalizeTaskKey = (value: unknown, fallback: string) => {
  const raw = trimString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return raw || fallback;
};

export const normalizeEnglishTaskConfig = (raw: unknown): EnglishTaskConfigItem[] => {
  const input = Array.isArray(raw) ? raw : [];
  const out: EnglishTaskConfigItem[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const row = input[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const obj = row as Record<string, unknown>;
    const zh = trimString(obj.chineseName).slice(0, 80);
    const en = trimString(obj.englishName).slice(0, 80);
    const keyFallback = `custom_${i + 1}`;
    const id = normalizeTaskId(obj.id, `task_${i + 1}`);
    const key = normalizeTaskKey(obj.key, keyFallback);
    const displayName = trimString(obj.displayName).slice(0, 120) || makeDisplayName(zh, en);
    if (!displayName) continue;
    out.push({
      id,
      key,
      chineseName: zh,
      englishName: en,
      displayName,
      weeklyTargetCount: clampWeeklyTarget(obj.weeklyTargetCount),
      enabled: obj.enabled !== false,
      enabledFields: normalizeEnabledFields(obj.enabledFields),
      sortOrder: Math.min(9999, Math.max(0, parseFiniteInteger(obj.sortOrder) ?? i)),
    });
  }

  if (!out.length) {
    return DEFAULT_ENGLISH_TASKS.map((t) => ({ ...t, enabledFields: [...t.enabledFields] }));
  }

  out.sort((a, b) => a.sortOrder - b.sortOrder);
  return out.map((item, index) => ({ ...item, sortOrder: index }));
};

export const hasCustomEnglishTaskConfig = (raw: unknown): boolean => {
  const normalized = normalizeEnglishTaskConfig(raw);
  if (normalized.length !== DEFAULT_ENGLISH_TASKS.length) return true;
  const compareKeys = ['key', 'displayName', 'weeklyTargetCount', 'enabled'] as const;
  for (let i = 0; i < DEFAULT_ENGLISH_TASKS.length; i += 1) {
    const left = normalized[i];
    const right = DEFAULT_ENGLISH_TASKS[i];
    if (!left || !right) return true;
    for (const key of compareKeys) {
      if (left[key] !== right[key]) return true;
    }
    if (left.enabledFields.join(',') !== right.enabledFields.join(',')) return true;
  }
  return false;
};
