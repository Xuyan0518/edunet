type NarrativeValidationError = {
  activityIndex: number;
  subjectName: string;
  missingFields: Array<'taskSummary' | 'strengths' | 'improvements'>;
  message: string;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const toTrimmed = (v: unknown): string => String(v ?? '').trim();

const displaySubjectName = (a: Record<string, unknown>): string =>
  toTrimmed(a.subjectDisplayName) || toTrimmed(a.subjectName) || toTrimmed(a.subject) || '未知科目';

const isEnglishActivity = (a: Record<string, unknown>) => {
  const type = toTrimmed(a.type).toLowerCase();
  if (type === 'english') return true;
  const subject = `${toTrimmed(a.subjectName)} ${toTrimmed(a.subject)} ${toTrimmed(a.subjectDisplayName)}`.toLowerCase();
  return subject.includes('english') || subject.includes('英文') || subject.includes('英语');
};

export function validateActivityNarratives(activities: unknown): {
  ok: boolean;
  errors: NarrativeValidationError[];
} {
  if (!Array.isArray(activities)) return { ok: true, errors: [] };
  const errors: NarrativeValidationError[] = [];
  activities.forEach((raw, idx) => {
    if (!isPlainObject(raw)) return;
    if (isEnglishActivity(raw)) return;
    const taskSummary = toTrimmed(raw.taskSummary) || toTrimmed(raw.practiceProgress) || toTrimmed(raw.description);
    const strengths = toTrimmed(raw.strengths);
    const improvements = toTrimmed(raw.improvements);
    const missingFields: Array<'taskSummary' | 'strengths' | 'improvements'> = [];
    if (!taskSummary) missingFields.push('taskSummary');
    if (!strengths) missingFields.push('strengths');
    if (!improvements) missingFields.push('improvements');
    if (!missingFields.length) return;
    errors.push({
      activityIndex: idx,
      subjectName: displaySubjectName(raw),
      missingFields,
      message: `${displaySubjectName(raw)} missing ${missingFields.join(',')}`,
    });
  });
  return { ok: errors.length === 0, errors };
}
