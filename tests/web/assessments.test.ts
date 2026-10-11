import { expect, it } from "vitest";
import {
  examPayload,
  paperPayload,
  Exam,
  Paper
} from "@/features/assessments/contracts";
import {
  validateExamSubjects,
  validatePaperPayload
} from "../../server/utils/inputValidation";
const exam: Exam = {
  name: "WA1",
  examDate: "2026-10-10",
  subjects: [
    { name: "Math", score: "", examDate: "2026-10-12" },
    { name: "English", score: "0", examDate: "2026-10-11" },
    { name: "Empty", score: "", examDate: "" }
  ]
};
const paper: Paper = {
  typeId: "type",
  schoolId: "school",
  date: "2026-10-03",
  description: "Practice",
  strengths: "Clear work",
  improvements: "Check signs",
  score: null,
  total: null
};
it("retains scoreless schedules and zero scores, drops empty rows and selects the earliest date", () => {
  const payload = examPayload(exam);
  expect(payload.subjects).toHaveLength(2);
  expect(payload.examDate).toBe("2026-10-11");
  expect(payload.subjects[1].score).toBe("0");
  expect(validateExamSubjects(payload.subjects)).toEqual([]);
});
it("retains hidden exam metadata, scope and original edit version", () => {
  const payload = examPayload({
    ...exam,
    id: "exam",
    updatedAt: "version",
    examType: "WA1",
    reminderDate: "2026-10-01",
    subjects: [
      {
        name: "Math",
        score: "37/50",
        scope: "Chapters 1–3",
        examDate: "2026-10-12"
      }
    ]
  });
  expect(payload).toMatchObject({
    updatedAt: "version",
    examType: "WA1",
    reminderDate: "2026-10-01",
    subjects: [{ scope: "Chapters 1–3", score: "37/50" }]
  });
  expect(validateExamSubjects(payload.subjects)).toEqual([]);
});
it("rejects malformed scores, invalid dates and empty subject sets", () => {
  for (const score of ["-1", "50/0", "51/50", "501", "x"])
    expect(() =>
      examPayload({ ...exam, subjects: [{ name: "Math", score }] })
    ).toThrow();
  expect(() =>
    examPayload({
      ...exam,
      subjects: [{ name: "Math", score: "", examDate: "2026-02-30" }]
    })
  ).toThrow();
  expect(() => examPayload({ ...exam, subjects: [] })).toThrow();
});
it("preserves optional paper scores and zero without coercing blanks", () => {
  expect(paperPayload(paper)).toMatchObject({ score: null, total: null });
  const payload = paperPayload({ ...paper, score: 0, total: 100 });
  expect(payload).toMatchObject({ score: 0, total: 100 });
  expect(validatePaperPayload(payload, "paper")).toEqual([]);
});
it("matches current server integer validation before its numeric conversion", () => {
  for (const score of [1.5, -1, 501]) {
    expect(() => paperPayload({ ...paper, score })).toThrow();
    expect(
      validatePaperPayload({ ...paper, score }, "paper").length
    ).toBeGreaterThan(0);
  }
  expect(() => paperPayload({ ...paper, score: 5, total: 4 })).toThrow();
  expect(() => paperPayload({ ...paper, total: 0 })).toThrow();
});
it("requires both paper evaluations and existing version; excludes display-only fields", () => {
  expect(() => paperPayload({ ...paper, strengths: "" })).toThrow();
  expect(() => paperPayload({ ...paper, id: "p" })).toThrow();
  const payload = paperPayload({
    ...paper,
    id: "p",
    updatedAt: "v",
    typeName: "UI only",
    schoolName: "UI only"
  });
  expect(payload.updatedAt).toBe("v");
  expect(payload).not.toHaveProperty("typeName");
});
