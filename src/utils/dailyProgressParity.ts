export type AssignedSubject = {
  id: string;
  name: string;
  code?: string;
};

export type EnglishExercise = {
  score: number | null;
  totalScore: number | null;
  problems: string;
};

export type EnglishScoredBlock = {
  text: string;
  score: number | null;
  totalScore: number | null;
  exerciseCount?: number;
  articleCount?: number;
  exercises: EnglishExercise[];
  lossPointIds: string[];
  lossPointLabelsSnapshot: string[];
  otherLossPointText: string;
};

export type EnglishFields = {
  editing: EnglishScoredBlock;
  reading: EnglishScoredBlock;
  grammar: EnglishScoredBlock;
  vocab: { text: string; vocabularySentenceCount: number; vocabularyWordCount: number };
  recitation: { text: string };
  essay: {
    text: string;
    title: string;
    completed: boolean;
    score: number | null;
    totalScore: number | null;
    lossPointIds: string[];
    lossPointLabelsSnapshot: string[];
    otherLossPointText: string;
  };
};

export type CustomEnglishTask = {
  taskId: string;
  key: string;
  displayName: string;
  practiceCount: number;
  score: number | null;
  maxScore: number | null;
  problems: string;
  exercises: EnglishExercise[];
  completed: boolean;
  targetCount: number;
  fieldsUsed: string[];
};

export type DailyActivity = {
  subjectId: string;
  subjectName: string;
  subjectDisplayName?: string;
  type: 'english' | 'generic';
  locked?: boolean;
  english?: EnglishFields;
  customEnglishTasks?: CustomEnglishTask[];
  taskSummary?: string;
  practiceProgress?: string;
  definitionRecitation?: string;
  strengths?: string;
  improvements?: string;
  comment?: string;
  papers?: unknown[];
};

export type EnglishTaskConfiguration = {
  id?: string;
  key: string;
  displayName?: string;
  chineseName?: string;
  englishName?: string;
  enabled?: boolean;
  enabledFields?: string[];
  weeklyTargetCount?: number;
};

const CANONICAL_ENGLISH_TASK_KEYS = new Set(['editing', 'reading', 'grammar', 'vocab', 'vocabulary', 'recitation', 'essay']);

export const mergeConfiguredCustomEnglishTasks = (
  existingTasks: CustomEnglishTask[],
  configurations: EnglishTaskConfiguration[],
): CustomEnglishTask[] => {
  const existingByKey = new Map(existingTasks.map((task) => [task.key.toLowerCase(), task]));
  const seen = new Set<string>();
  const configured: CustomEnglishTask[] = [];

  for (const configuration of configurations) {
    const key = configuration.key.toLowerCase();
    if (configuration.enabled === false || CANONICAL_ENGLISH_TASK_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    configured.push(existingByKey.get(key) || {
      taskId: configuration.id || configuration.key,
      key,
      displayName: configuration.displayName || configuration.chineseName || configuration.englishName || configuration.key,
      practiceCount: 0,
      score: null,
      maxScore: null,
      problems: '',
      exercises: [],
      completed: false,
      targetCount: configuration.weeklyTargetCount || 0,
      fieldsUsed: configuration.enabledFields || ['practiceCount', 'score', 'problems'],
    });
  }

  return [
    ...configured,
    ...existingTasks.filter((task) => !seen.has(task.key.toLowerCase())),
  ];
};

export type DailyProgressRecord = {
  id: string;
  studentId: string;
  date: string;
  attendance: string;
  attendanceStart?: string | null;
  attendanceEnd?: string | null;
  absenceReason?: string | null;
  summary?: string | null;
  activities: unknown[];
};

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const numberOrNull = (value: unknown): number | null => {
  if (value === '' || value == null) return null;
  const valueNumber = Number(value);
  return Number.isFinite(valueNumber) ? valueNumber : null;
};
const int = (value: unknown) => Math.max(0, Math.floor(numberOrNull(value) ?? 0));
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const emptyScoredBlock = (kind: 'editing' | 'reading' | 'grammar'): EnglishScoredBlock => ({
  text: '',
  score: null,
  totalScore: 100,
  ...(kind === 'reading' ? { articleCount: 0 } : { exerciseCount: 0 }),
  exercises: [],
  lossPointIds: [],
  lossPointLabelsSnapshot: [],
  otherLossPointText: '',
});

export const createEmptyEnglishFields = (): EnglishFields => ({
  editing: emptyScoredBlock('editing'),
  reading: emptyScoredBlock('reading'),
  grammar: emptyScoredBlock('grammar'),
  vocab: { text: '', vocabularySentenceCount: 0, vocabularyWordCount: 0 },
  recitation: { text: '' },
  essay: {
    text: '',
    title: '',
    completed: false,
    score: null,
    totalScore: null,
    lossPointIds: [],
    lossPointLabelsSnapshot: [],
    otherLossPointText: '',
  },
});

export const isEnglishSubject = (subject: Partial<AssignedSubject> | string) => {
  const name = typeof subject === 'string' ? subject : `${subject.name || ''} ${subject.code || ''}`;
  const normalized = name.toLowerCase();
  return normalized.includes('english') || normalized.includes('英文') || normalized.includes('英语') || normalized.includes(' eng');
};

export const createDefaultEnglishActivity = (subject?: Partial<AssignedSubject>): DailyActivity => ({
  subjectId: subject?.id || '',
  subjectName: subject?.name || 'English',
  subjectDisplayName: subject?.name || 'English',
  type: 'english',
  locked: true,
  english: createEmptyEnglishFields(),
  customEnglishTasks: [],
  taskSummary: '',
  strengths: '',
  improvements: '',
  comment: '',
  papers: [],
});

export const createAssignedSubjectActivity = (subject: AssignedSubject): DailyActivity => {
  if (isEnglishSubject(subject)) return createDefaultEnglishActivity(subject);
  return {
    subjectId: subject.id,
    subjectName: subject.name,
    subjectDisplayName: subject.name,
    type: 'generic',
    taskSummary: '',
    practiceProgress: '',
    definitionRecitation: '',
    strengths: '',
    improvements: '',
    comment: '',
    papers: [],
  };
};

export const addAssignedSubjectActivity = (activities: DailyActivity[], subject: AssignedSubject) => {
  if (activities.some((activity) => activity.subjectId === subject.id || (isEnglishSubject(subject) && activity.type === 'english'))) {
    return activities;
  }
  return [...activities, createAssignedSubjectActivity(subject)];
};

const normalizeExercise = (value: unknown, fallbackTotal = 100): EnglishExercise => {
  const source = object(value);
  return {
    score: numberOrNull(source.score),
    totalScore: numberOrNull(source.totalScore ?? source.maxScore) ?? fallbackTotal,
    problems: text(source.problems),
  };
};

const normalizeScoredBlock = (value: unknown, kind: 'editing' | 'reading' | 'grammar'): EnglishScoredBlock => {
  const source = object(value);
  const fallback = emptyScoredBlock(kind);
  const countKey = kind === 'reading' ? 'articleCount' : 'exerciseCount';
  const configuredCount = int(source[countKey]);
  const exercises = Array.isArray(source.exercises)
    ? source.exercises.map((exercise) => normalizeExercise(exercise, numberOrNull(source.totalScore) ?? 100))
    : [];
  while (exercises.length < configuredCount) exercises.push(normalizeExercise({}, numberOrNull(source.totalScore) ?? 100));
  return {
    ...fallback,
    text: text(source.text),
    score: numberOrNull(source.score),
    totalScore: numberOrNull(source.totalScore) ?? 100,
    [countKey]: Math.max(configuredCount, exercises.length),
    exercises,
    lossPointIds: Array.isArray(source.lossPointIds) ? source.lossPointIds.map(String) : [],
    lossPointLabelsSnapshot: Array.isArray(source.lossPointLabelsSnapshot) ? source.lossPointLabelsSnapshot.map(String) : [],
    otherLossPointText: text(source.otherLossPointText),
  };
};

export const normalizeEnglishFields = (value: unknown): EnglishFields => {
  const source = object(value);
  const vocab = object(source.vocab ?? source.vocabulary);
  const recitation = object(source.recitation ?? source.memory);
  const essay = object(source.essay);
  return {
    editing: normalizeScoredBlock(source.editing, 'editing'),
    reading: normalizeScoredBlock(source.reading, 'reading'),
    grammar: normalizeScoredBlock(source.grammar, 'grammar'),
    vocab: {
      text: text(vocab.text),
      vocabularySentenceCount: int(vocab.vocabularySentenceCount),
      vocabularyWordCount: int(vocab.vocabularyWordCount),
    },
    recitation: { text: text(recitation.text ?? source.recitation ?? source.memory) },
    essay: {
      text: text(essay.text),
      title: text(essay.title),
      completed: essay.completed === true,
      score: numberOrNull(essay.score),
      totalScore: numberOrNull(essay.totalScore),
      lossPointIds: Array.isArray(essay.lossPointIds) ? essay.lossPointIds.map(String) : [],
      lossPointLabelsSnapshot: Array.isArray(essay.lossPointLabelsSnapshot) ? essay.lossPointLabelsSnapshot.map(String) : [],
      otherLossPointText: text(essay.otherLossPointText),
    },
  };
};

const normalizeCustomTask = (value: unknown, index: number): CustomEnglishTask => {
  const source = object(value);
  const practiceCount = int(source.practiceCount);
  const maxScore = numberOrNull(source.maxScore);
  const exercises = Array.isArray(source.exercises)
    ? source.exercises.map((exercise) => normalizeExercise(exercise, maxScore ?? 100))
    : [];
  while (exercises.length < practiceCount) exercises.push(normalizeExercise({}, maxScore ?? 100));
  const key = text(source.key).toLowerCase() || `custom_${index + 1}`;
  return {
    taskId: text(source.taskId ?? source.id) || key,
    key,
    displayName: text(source.displayName ?? source.chineseName ?? source.englishName) || key,
    practiceCount: Math.max(practiceCount, exercises.length),
    score: numberOrNull(source.score),
    maxScore,
    problems: text(source.problems),
    exercises,
    completed: source.completed === true,
    targetCount: int(source.targetCount ?? source.weeklyTargetCount),
    fieldsUsed: Array.isArray(source.fieldsUsed ?? source.enabledFields)
      ? (source.fieldsUsed ?? source.enabledFields as unknown[]).map(String)
      : ['practiceCount', 'score', 'problems'],
  };
};

export const normalizeDailyActivity = (value: unknown): DailyActivity => {
  const source = object(value);
  const subjectName = text(source.subjectName ?? source.subject);
  const rawEnglish = source.english ?? source.englishFields;
  const english = source.type === 'english' || isEnglishSubject(subjectName) || Object.keys(object(rawEnglish)).length > 0;
  if (english) {
    const tasks = source.customEnglishTasks ?? source.englishTasks;
    return {
      ...createDefaultEnglishActivity({ id: text(source.subjectId), name: subjectName || 'English' }),
      english: normalizeEnglishFields({ ...object(rawEnglish), ...source }),
      customEnglishTasks: Array.isArray(tasks) ? tasks.map(normalizeCustomTask) : [],
      taskSummary: text(source.taskSummary ?? source.practiceProgress ?? source.description),
      strengths: text(source.strengths),
      improvements: text(source.improvements),
      comment: text(source.comment),
      papers: Array.isArray(source.papers) ? source.papers : [],
    };
  }
  return {
    subjectId: text(source.subjectId),
    subjectName,
    subjectDisplayName: text(source.subjectDisplayName) || subjectName,
    type: 'generic',
    taskSummary: text(source.taskSummary ?? source.practiceProgress ?? source.description),
    practiceProgress: text(source.practiceProgress ?? source.description),
    definitionRecitation: text(source.definitionRecitation ?? source.notes),
    strengths: text(source.strengths),
    improvements: text(source.improvements),
    comment: text(source.comment),
    papers: Array.isArray(source.papers) ? source.papers : [],
  };
};

export const ensureEnglishActivity = (activities: unknown[], assignedSubjects: AssignedSubject[] = []) => {
  const normalized = activities.map(normalizeDailyActivity);
  const englishSubject = assignedSubjects.find(isEnglishSubject);
  const englishIndex = normalized.findIndex((activity) => activity.type === 'english');
  if (englishIndex < 0) return [createDefaultEnglishActivity(englishSubject), ...normalized];
  const english = normalized[englishIndex];
  if (englishSubject) {
    english.subjectId = englishSubject.id;
    english.subjectName = englishSubject.name;
    english.subjectDisplayName = englishSubject.name;
  }
  return [english, ...normalized.filter((_, index) => index !== englishIndex)];
};

export type WeeklyActivitySection = {
  title: string;
  rows: Array<{ label: string; scoreText?: string; value?: string; problems?: string }>;
};

export type WeeklyActivityView = {
  subjectName: string;
  type: 'english' | 'generic';
  summary: string;
  sections: WeeklyActivitySection[];
};

export type WeeklyProgressDay = DailyProgressRecord & {
  isAbsent: boolean;
  activities: WeeklyActivityView[];
};

const scoreText = (score: unknown, total: unknown) => {
  const numericScore = numberOrNull(score);
  if (numericScore == null) return '';
  const numericTotal = numberOrNull(total);
  return numericTotal == null ? String(numericScore) : `${numericScore}/${numericTotal}`;
};

const scoredSection = (title: string, block: EnglishScoredBlock, unit: string): WeeklyActivitySection | null => {
  const rows = block.exercises.map((exercise, index) => ({
    label: `${unit} ${index + 1}`,
    scoreText: scoreText(exercise.score, exercise.totalScore),
    problems: exercise.problems,
  }));
  if (!rows.length && block.score != null) {
    rows.push({ label: `${unit} 1`, scoreText: scoreText(block.score, block.totalScore), problems: block.text });
  }
  return rows.length ? { title, rows } : null;
};

const englishSections = (activity: DailyActivity) => {
  const english = activity.english ?? createEmptyEnglishFields();
  const sections: WeeklyActivitySection[] = [];
  const canonical = [
    scoredSection('Editing', english.editing, 'Exercise'),
    scoredSection('Reading', english.reading, 'Article'),
    scoredSection('Grammar', english.grammar, 'Exercise'),
  ];
  canonical.forEach((section) => { if (section) sections.push(section); });
  if (english.vocab.vocabularyWordCount || english.vocab.vocabularySentenceCount || english.vocab.text) {
    sections.push({ title: 'Vocabulary', rows: [
      { label: 'Words', value: String(english.vocab.vocabularyWordCount || '') },
      { label: 'Sentences', value: String(english.vocab.vocabularySentenceCount || '') },
      ...(english.vocab.text ? [{ label: 'Notes', value: english.vocab.text }] : []),
    ] });
  }
  if (english.recitation.text) sections.push({ title: 'Recitation', rows: [{ label: 'Notes', value: english.recitation.text }] });
  if (english.essay.title || english.essay.text || english.essay.completed || english.essay.score != null) {
    sections.push({ title: 'Essay', rows: [
      ...(english.essay.title ? [{ label: 'Title', value: english.essay.title }] : []),
      ...(english.essay.score != null ? [{ label: 'Score', scoreText: scoreText(english.essay.score, english.essay.totalScore) }] : []),
      { label: 'Completed', value: english.essay.completed ? 'Yes' : 'No' },
      ...(english.essay.text ? [{ label: 'Notes', value: english.essay.text }] : []),
    ] });
  }
  for (const task of activity.customEnglishTasks ?? []) {
    const rows = task.exercises.map((exercise, index) => ({
      label: `Exercise ${index + 1}`,
      scoreText: scoreText(exercise.score, exercise.totalScore),
      problems: exercise.problems,
    }));
    if (!rows.length && (task.score != null || task.problems || task.practiceCount)) {
      rows.push({ label: 'Result', scoreText: scoreText(task.score, task.maxScore), problems: task.problems });
    }
    if (rows.length) sections.push({ title: task.displayName, rows });
  }
  return sections;
};

export const toWeeklyProgressDays = (
  records: DailyProgressRecord[],
  weekStarting: string,
  weekEnding: string,
): WeeklyProgressDay[] => records
  .map((record) => ({ ...record, date: String(record.date || '').slice(0, 10) }))
  .filter((record) => record.date >= weekStarting && record.date <= weekEnding)
  .sort((a, b) => a.date.localeCompare(b.date))
  .map((record) => {
    const isAbsent = record.attendance === 'absent';
    return {
      ...record,
      isAbsent,
      activities: isAbsent ? [] : (record.activities || []).map(normalizeDailyActivity).map((activity) => ({
        subjectName: activity.subjectDisplayName || activity.subjectName || 'Subject',
        type: activity.type,
        summary: activity.type === 'generic'
          ? (activity.taskSummary || activity.practiceProgress || '')
          : (activity.taskSummary || ''),
        sections: activity.type === 'english'
          ? englishSections(activity)
          : [{ title: 'Learning details', rows: [
              ...(activity.taskSummary ? [{ label: 'Work completed', value: activity.taskSummary }] : []),
              ...(activity.strengths ? [{ label: 'Strengths', value: activity.strengths }] : []),
              ...(activity.improvements ? [{ label: 'Needs improvement', value: activity.improvements }] : []),
              ...(activity.definitionRecitation ? [{ label: 'Recitation / notes', value: activity.definitionRecitation }] : []),
              ...(activity.comment ? [{ label: 'Comments', value: activity.comment }] : []),
            ] }],
      })),
    };
  });
