import { normalizeEnglishFields } from "./englishNormalize";
export type HistoricalRecord = Record<string, unknown>;
export const record = (value: unknown): HistoricalRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as HistoricalRecord)
    : {};
export const text = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
export const hasValue = (value: unknown): boolean =>
  value !== undefined &&
  value !== null &&
  value !== "" &&
  (!Array.isArray(value) || value.length > 0);

// Display model only. Keep the original record separately for future write serializers.
// Today's task settings must never replace a historical task's labels, fields or target.
export function readActivity(value: unknown) {
  const raw = record(value);
  const subject = text(
    raw.subjectDisplayName || raw.subjectName || raw.subject
  );
  const englishRaw = raw.english ?? raw.englishFields;
  const english =
    raw.type === "english" ||
    /english|英文|英语/i.test(subject) ||
    englishRaw != null;
  const tasks = Array.isArray(raw.englishTasks)
    ? raw.englishTasks
    : Array.isArray(raw.customEnglishTasks)
    ? raw.customEnglishTasks
    : [];
  return {
    original: structuredClone(raw),
    subject,
    performance: text(raw.performance),
    narratives: ([
      "taskSummary",
      "strengths",
      "improvements",
      "practiceProgress",
      "definitionRecitation",
      "comment",
      "description",
      "notes"
    ] as const)
      .filter(key => hasValue(raw[key]))
      .map(key => ({ key, value: text(raw[key]) })),
    english: english ? normalizeEnglishFields(englishRaw) : null,
    recordedSkills: Object.keys(record(englishRaw)),
    legacyEnglishText: typeof englishRaw === "string" ? englishRaw : text(raw.legacyEnglishText),
    tasks: tasks.map(value => {
      const task = record(value);
      return {
        ...structuredClone(task),
        label: text(
          task.name ||
            task.displayName ||
            task.chineseName ||
            task.englishName ||
            task.key ||
            task.id
        )
      };
    }),
    papers: Array.isArray(raw.papers) ? structuredClone(raw.papers) : []
  };
}
