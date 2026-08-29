export type ParentPaperSource = {
  id: unknown;
  studentId: unknown;
  subjectName?: unknown;
  description?: unknown;
  date: unknown;
  score?: unknown;
  total?: unknown;
  grade?: unknown;
  scoreLevel?: unknown;
  scoreStatus?: unknown;
  [key: string]: unknown;
};

export const toParentPaperDto = (paper: ParentPaperSource) => ({
  id: paper.id,
  studentId: paper.studentId,
  subjectName: paper.subjectName,
  description: paper.description,
  date: paper.date,
  score: paper.score,
  total: paper.total,
  grade: paper.grade,
  scoreLevel: paper.scoreLevel,
  scoreStatus: paper.scoreStatus,
});
