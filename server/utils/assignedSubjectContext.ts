export interface AssignedSubject {
  id: string;
  name: string;
  code?: string | null;
}
type SubjectReference = {
  subjectId?: unknown;
  subjectRawName?: unknown;
  subjectName?: unknown;
  subject?: unknown;
  name?: unknown;
  type?: unknown;
};
const normalize = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();
export function subjectInScope(
  row: SubjectReference,
  subjects: AssignedSubject[]
) {
  if (row.subjectId)
    return subjects.some(subject => subject.id === row.subjectId);
  const name = normalize(
    row.subjectRawName || row.subjectName || row.subject || row.name
  );
  return subjects.some(
    subject =>
      normalize(subject.name) === name ||
      (subject.code === "ENGLISH" &&
        (/^(english|英文|英语)$/.test(name) ||
          (!name && row.type === "english")))
  );
}
// Only newly generated material is scoped. Stored historical records are never rewritten.
export function scopeDaily<T extends { activities?: unknown }>(
  rows: T[],
  subjects: AssignedSubject[]
): T[] {
  return rows.map(row => ({
    ...row,
    activities: (Array.isArray(row.activities) ? row.activities : []).filter(
      activity =>
        activity &&
        typeof activity === "object" &&
        subjectInScope(activity, subjects)
    )
  }));
}
export function scopePapers<T extends SubjectReference>(
  rows: T[],
  subjects: AssignedSubject[]
) {
  return rows.filter(row => subjectInScope(row, subjects));
}
export function scopeExams<T extends { subjects: SubjectReference[] }>(
  rows: T[],
  subjects: AssignedSubject[]
): T[] {
  return rows
    .map(row => ({
      ...row,
      subjects: row.subjects.filter(subject =>
        subjectInScope(subject, subjects)
      )
    }))
    .filter(row => row.subjects.length);
}
export function scopeGeneratedReport(
  report: Record<string, unknown> | null,
  subjects: AssignedSubject[]
) {
  if (!report || !Array.isArray(report.subjectReports)) return report;
  return {
    ...report,
    subjectReports: report.subjectReports.filter(
      row => row && typeof row === "object" && subjectInScope(row, subjects)
    )
  };
}
export function assignedSubjectPrompt(subjects: AssignedSubject[]) {
  return `\n科目范围：仅分析学生当前已关联科目 ${JSON.stringify(
    subjects.map(subject => subject.name)
  )}。subjectReports 的 subjectName 必须使用该列表的原始名称，不得新增或分析其他科目。历史总结中的其他科目不在本次范围内。缺少记录的日期只表示没有数据，不能据此推断缺勤、学习频率不足或全年学习不连续。`;
}
