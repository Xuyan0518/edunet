import { parseDateString } from './chinaDate';

export type ValidationIssue = {
  field: string;
  message: string;
};

export const INPUT_LIMITS = {
  yearMin: 2000,
  yearMax: 2100,
  dailyActivityMax: 40,
  activityTextMax: 1000,
  summaryTextMax: 5000,
  shortTextMax: 120,
  paperCommentMax: 1000,
  paperDescriptionMax: 200,
  reportTextMax: 5000,
  reportJsonCharsMax: 120_000,
  examSubjectsMax: 30,
  papersBatchMax: 60,
  englishExerciseMax: 30,
  englishVocabCountMax: 500,
  englishSentenceCountMax: 500,
  englishTaskConfigMax: 30,
  englishScoreMin: 0,
  englishScoreMax: 100,
  scoreMin: 0,
  scoreMax: 500,
  weeklyDateRangeMaxDays: 10,
  quarterlyDateRangeMaxDays: 220,
  exportDateRangeMaxDays: 370,
} as const;

const MS_PER_DAY = 86_400_000;

const safeObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

export const trimString = (value: unknown) => String(value ?? '').trim();

export const textTooLong = (value: unknown, max: number) => trimString(value).length > max;

export const parseFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
};

export const parseFiniteInteger = (value: unknown): number | null => {
  const n = parseFiniteNumber(value);
  if (n === null) return null;
  return Number.isInteger(n) ? n : null;
};

export const isValidDateOnly = (value: unknown) => Boolean(parseDateString(value));

export const dayDiffInclusive = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.floor((end - start) / MS_PER_DAY) + 1;
};

export const validateYearRange = (year: number, field = 'year'): ValidationIssue | null => {
  if (!Number.isFinite(year)) return { field, message: '年份必须是有效数字' };
  const y = Math.trunc(year);
  if (y < INPUT_LIMITS.yearMin || y > INPUT_LIMITS.yearMax) {
    return { field, message: `年份必须在 ${INPUT_LIMITS.yearMin}-${INPUT_LIMITS.yearMax}` };
  }
  return null;
};

export const validateDateRange = (params: {
  startDate: string;
  endDate: string;
  maxDays: number;
  fieldPrefix: string;
}): ValidationIssue[] => {
  const { startDate, endDate, maxDays, fieldPrefix } = params;
  const issues: ValidationIssue[] = [];
  if (!isValidDateOnly(startDate)) issues.push({ field: `${fieldPrefix}.startDate`, message: '开始日期无效' });
  if (!isValidDateOnly(endDate)) issues.push({ field: `${fieldPrefix}.endDate`, message: '结束日期无效' });
  if (issues.length) return issues;
  if (startDate > endDate) {
    issues.push({ field: fieldPrefix, message: '开始日期不能晚于结束日期' });
    return issues;
  }
  const days = dayDiffInclusive(startDate, endDate);
  if (days > maxDays) {
    issues.push({ field: fieldPrefix, message: `日期范围过大（最多 ${maxDays} 天）` });
  }
  return issues;
};

const validateNumberRange = (params: {
  field: string;
  value: unknown;
  min: number;
  max: number;
  integer?: boolean;
  allowNull?: boolean;
}): ValidationIssue | null => {
  const { field, value, min, max, integer = false, allowNull = true } = params;
  const parsed = integer ? parseFiniteInteger(value) : parseFiniteNumber(value);
  if (parsed === null) {
    return allowNull ? null : { field, message: '必须是有效数字' };
  }
  if (parsed < min || parsed > max) {
    return { field, message: `必须在 ${min}-${max} 范围内` };
  }
  return null;
};

const validateActivityTextFields = (activity: Record<string, unknown>, path: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const fields = ['taskSummary', 'strengths', 'improvements', 'practiceProgress', 'definitionRecitation', 'comment'];
  fields.forEach((field) => {
    if (textTooLong(activity[field], INPUT_LIMITS.activityTextMax)) {
      issues.push({ field: `${path}.${field}`, message: `文本过长（最多 ${INPUT_LIMITS.activityTextMax} 字）` });
    }
  });
  return issues;
};

export const validateDailyProgressExtremes = (activitiesRaw: unknown): ValidationIssue[] => {
  if (!Array.isArray(activitiesRaw)) return [{ field: 'activities', message: 'activities 必须是数组' }];
  const issues: ValidationIssue[] = [];
  if (activitiesRaw.length > INPUT_LIMITS.dailyActivityMax) {
    issues.push({ field: 'activities', message: `活动数量过多（最多 ${INPUT_LIMITS.dailyActivityMax} 条）` });
  }

  activitiesRaw.forEach((row, index) => {
    const path = `activities[${index}]`;
    const activity = safeObject(row);
    issues.push(...validateActivityTextFields(activity, path));

    const english = safeObject(activity.english);
    const englishTasks = Array.isArray(activity.englishTasks) ? activity.englishTasks : [];
    if (englishTasks.length > INPUT_LIMITS.englishTaskConfigMax) {
      issues.push({ field: `${path}.englishTasks`, message: `英文任务数量过多（最多 ${INPUT_LIMITS.englishTaskConfigMax} 条）` });
    }
    englishTasks.forEach((entry, taskIndex) => {
      const task = safeObject(entry);
      if (textTooLong(task.displayName, INPUT_LIMITS.shortTextMax)) {
        issues.push({
          field: `${path}.englishTasks[${taskIndex}].displayName`,
          message: `任务名称过长（最多 ${INPUT_LIMITS.shortTextMax} 字）`,
        });
      }
      const practiceIssue = validateNumberRange({
        field: `${path}.englishTasks[${taskIndex}].practiceCount`,
        value: task.practiceCount,
        min: 0,
        max: INPUT_LIMITS.englishVocabCountMax,
        integer: true,
      });
      if (practiceIssue) issues.push(practiceIssue);
      const scoreIssue = validateNumberRange({
        field: `${path}.englishTasks[${taskIndex}].score`,
        value: task.score,
        min: INPUT_LIMITS.englishScoreMin,
        max: INPUT_LIMITS.englishScoreMax,
        integer: false,
      });
      if (scoreIssue) issues.push(scoreIssue);
      if (textTooLong(task.problems, INPUT_LIMITS.activityTextMax)) {
        issues.push({
          field: `${path}.englishTasks[${taskIndex}].problems`,
          message: `文本过长（最多 ${INPUT_LIMITS.activityTextMax} 字）`,
        });
      }
    });

    const editing = safeObject(english.editing);
    const reading = safeObject(english.reading);
    const grammar = safeObject(english.grammar);
    const vocab = safeObject(english.vocab);
    const recitation = safeObject(english.recitation);
    const essay = safeObject(english.essay);

    const scoredBlocks = [
      { field: `${path}.english.editing.score`, value: editing.score },
      { field: `${path}.english.reading.score`, value: reading.score },
      { field: `${path}.english.grammar.score`, value: grammar.score },
      { field: `${path}.english.essay.score`, value: essay.score },
    ];

    scoredBlocks.forEach((item) => {
      const issue = validateNumberRange({
        field: item.field,
        value: item.value,
        min: INPUT_LIMITS.englishScoreMin,
        max: INPUT_LIMITS.englishScoreMax,
        integer: false,
      });
      if (issue) issues.push(issue);
    });

    const countChecks = [
      { field: `${path}.english.editing.exerciseCount`, value: editing.exerciseCount, max: INPUT_LIMITS.englishExerciseMax },
      { field: `${path}.english.reading.articleCount`, value: reading.articleCount, max: INPUT_LIMITS.englishExerciseMax },
      { field: `${path}.english.grammar.exerciseCount`, value: grammar.exerciseCount, max: INPUT_LIMITS.englishExerciseMax },
      { field: `${path}.english.vocab.vocabularyWordCount`, value: vocab.vocabularyWordCount, max: INPUT_LIMITS.englishVocabCountMax },
      { field: `${path}.english.vocab.vocabularySentenceCount`, value: vocab.vocabularySentenceCount, max: INPUT_LIMITS.englishSentenceCountMax },
    ];

    countChecks.forEach((item) => {
      const issue = validateNumberRange({
        field: item.field,
        value: item.value,
        min: 0,
        max: item.max,
        integer: true,
      });
      if (issue) issues.push(issue);
    });

    const editExercises = Array.isArray(editing.exercises) ? editing.exercises : [];
    const readingExercises = Array.isArray(reading.exercises) ? reading.exercises : [];
    const grammarExercises = Array.isArray(grammar.exercises) ? grammar.exercises : [];
    if (editExercises.length > INPUT_LIMITS.englishExerciseMax) {
      issues.push({ field: `${path}.english.editing.exercises`, message: '练习条数过多' });
    }
    if (readingExercises.length > INPUT_LIMITS.englishExerciseMax) {
      issues.push({ field: `${path}.english.reading.exercises`, message: '阅读条数过多' });
    }
    if (grammarExercises.length > INPUT_LIMITS.englishExerciseMax) {
      issues.push({ field: `${path}.english.grammar.exercises`, message: '语法条数过多' });
    }

    [
      { name: 'editing', list: editExercises },
      { name: 'reading', list: readingExercises },
      { name: 'grammar', list: grammarExercises },
    ].forEach(({ name, list }) => {
      list.forEach((ex, exIndex) => {
        const exObj = safeObject(ex);
        const scoreIssue = validateNumberRange({
          field: `${path}.english.${name}.exercises[${exIndex}].score`,
          value: exObj.score,
          min: INPUT_LIMITS.englishScoreMin,
          max: INPUT_LIMITS.englishScoreMax,
          integer: false,
        });
        if (scoreIssue) issues.push(scoreIssue);
        if (textTooLong(exObj.problems, INPUT_LIMITS.activityTextMax)) {
          issues.push({
            field: `${path}.english.${name}.exercises[${exIndex}].problems`,
            message: `文本过长（最多 ${INPUT_LIMITS.activityTextMax} 字）`,
          });
        }
      });
    });

    if (textTooLong(recitation.text, INPUT_LIMITS.activityTextMax)) {
      issues.push({ field: `${path}.english.recitation.text`, message: `文本过长（最多 ${INPUT_LIMITS.activityTextMax} 字）` });
    }
    if (textTooLong(essay.title, INPUT_LIMITS.shortTextMax)) {
      issues.push({ field: `${path}.english.essay.title`, message: `标题过长（最多 ${INPUT_LIMITS.shortTextMax} 字）` });
    }
    if (textTooLong(essay.text, INPUT_LIMITS.activityTextMax)) {
      issues.push({ field: `${path}.english.essay.text`, message: `文本过长（最多 ${INPUT_LIMITS.activityTextMax} 字）` });
    }

    ['editing', 'reading', 'grammar', 'essay'].forEach((fieldName) => {
      const fieldObj = safeObject(english[fieldName]);
      if (textTooLong(fieldObj.otherLossPointText, INPUT_LIMITS.activityTextMax)) {
        issues.push({
          field: `${path}.english.${fieldName}.otherLossPointText`,
          message: `文本过长（最多 ${INPUT_LIMITS.activityTextMax} 字）`,
        });
      }
      const ids = Array.isArray(fieldObj.lossPointIds) ? fieldObj.lossPointIds : [];
      if (ids.length > 30) {
        issues.push({ field: `${path}.english.${fieldName}.lossPointIds`, message: '失分点数量过多' });
      }
    });
  });

  return issues;
};

export const validateExamSubjects = (subjectsRaw: unknown): ValidationIssue[] => {
  if (!Array.isArray(subjectsRaw)) return [{ field: 'subjects', message: 'subjects 必须是数组' }];
  const issues: ValidationIssue[] = [];
  if (subjectsRaw.length > INPUT_LIMITS.examSubjectsMax) {
    issues.push({ field: 'subjects', message: `科目数量过多（最多 ${INPUT_LIMITS.examSubjectsMax} 条）` });
  }

  subjectsRaw.forEach((row, index) => {
    const item = safeObject(row);
    const field = `subjects[${index}]`;
    if (textTooLong(item.name, 50)) {
      issues.push({ field: `${field}.name`, message: '科目名称过长（最多 50 字）' });
    }
    if (textTooLong(item.scope, INPUT_LIMITS.activityTextMax)) {
      issues.push({ field: `${field}.scope`, message: `范围描述过长（最多 ${INPUT_LIMITS.activityTextMax} 字）` });
    }

    const scoreRaw = trimString(item.score);
    if (!scoreRaw) return;

    if (/^-?\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(scoreRaw)) {
      const [scorePart, totalPart] = scoreRaw.split('/').map((x) => Number(String(x).trim()));
      if (!Number.isFinite(scorePart) || !Number.isFinite(totalPart)) {
        issues.push({ field: `${field}.score`, message: '分数格式无效' });
        return;
      }
      if (totalPart <= 0 || totalPart > INPUT_LIMITS.scoreMax) {
        issues.push({ field: `${field}.score`, message: `总分必须在 1-${INPUT_LIMITS.scoreMax}` });
      }
      if (scorePart < INPUT_LIMITS.scoreMin || scorePart > totalPart) {
        issues.push({ field: `${field}.score`, message: '得分不能小于 0 且不能超过总分' });
      }
      return;
    }

    const score = parseFiniteNumber(scoreRaw);
    if (score === null) {
      issues.push({ field: `${field}.score`, message: '分数必须是数字或 x/y 格式' });
      return;
    }
    if (score < INPUT_LIMITS.scoreMin || score > INPUT_LIMITS.scoreMax) {
      issues.push({ field: `${field}.score`, message: `分数必须在 ${INPUT_LIMITS.scoreMin}-${INPUT_LIMITS.scoreMax}` });
    }
  });

  return issues;
};

export const validatePaperPayload = (paperRaw: unknown, fieldPrefix: string): ValidationIssue[] => {
  const paper = safeObject(paperRaw);
  const issues: ValidationIssue[] = [];

  if (textTooLong(paper.subjectName, 100)) {
    issues.push({ field: `${fieldPrefix}.subjectName`, message: '科目名称过长（最多 100 字）' });
  }
  if (textTooLong(paper.description, INPUT_LIMITS.paperDescriptionMax)) {
    issues.push({
      field: `${fieldPrefix}.description`,
      message: `描述过长（最多 ${INPUT_LIMITS.paperDescriptionMax} 字）`,
    });
  }
  if (textTooLong(paper.strengths, INPUT_LIMITS.paperCommentMax)) {
    issues.push({ field: `${fieldPrefix}.strengths`, message: `文本过长（最多 ${INPUT_LIMITS.paperCommentMax} 字）` });
  }
  if (textTooLong(paper.improvements, INPUT_LIMITS.paperCommentMax)) {
    issues.push({ field: `${fieldPrefix}.improvements`, message: `文本过长（最多 ${INPUT_LIMITS.paperCommentMax} 字）` });
  }

  const score = parseFiniteInteger(paper.score);
  const total = parseFiniteInteger(paper.total);
  if (trimString(paper.score)) {
    if (score === null || score < INPUT_LIMITS.scoreMin || score > INPUT_LIMITS.scoreMax) {
      issues.push({ field: `${fieldPrefix}.score`, message: `得分必须在 ${INPUT_LIMITS.scoreMin}-${INPUT_LIMITS.scoreMax}` });
    }
  }
  if (trimString(paper.total)) {
    if (total === null || total < 1 || total > INPUT_LIMITS.scoreMax) {
      issues.push({ field: `${fieldPrefix}.total`, message: `总分必须在 1-${INPUT_LIMITS.scoreMax}` });
    }
  }
  if (score !== null && total !== null && score > total) {
    issues.push({ field: `${fieldPrefix}.score`, message: '得分不能超过总分' });
  }

  if (paper.date && !isValidDateOnly(paper.date)) {
    issues.push({ field: `${fieldPrefix}.date`, message: '日期格式无效' });
  }

  return issues;
};

export const validateReportInput = (params: {
  title?: unknown;
  summary?: unknown;
  finalReport?: unknown;
  structuredReport?: unknown;
}): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (params.title !== undefined && textTooLong(params.title, 200)) {
    issues.push({ field: 'title', message: '标题过长（最多 200 字）' });
  }
  if (params.summary !== undefined && textTooLong(params.summary, INPUT_LIMITS.reportTextMax)) {
    issues.push({ field: 'summary', message: `总结过长（最多 ${INPUT_LIMITS.reportTextMax} 字）` });
  }

  const finalLen = params.finalReport == null ? 0 : JSON.stringify(params.finalReport).length;
  if (finalLen > INPUT_LIMITS.reportJsonCharsMax) {
    issues.push({ field: 'finalReport', message: '报告内容过大，请减少条目和文本长度后重试' });
  }
  const structuredLen = params.structuredReport == null ? 0 : JSON.stringify(params.structuredReport).length;
  if (structuredLen > INPUT_LIMITS.reportJsonCharsMax) {
    issues.push({ field: 'structuredReport', message: '结构化报告内容过大，请减少条目后重试' });
  }

  return issues;
};

export const validateDisplayName = (value: unknown): ValidationIssue | null => {
  const name = trimString(value);
  if (!name) return { field: 'displayName', message: '昵称不能为空' };
  if (name.length > 40) return { field: 'displayName', message: '昵称不能超过 40 字' };
  return null;
};
