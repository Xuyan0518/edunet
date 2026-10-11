import { beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  assignedSubject,
  loadStudentSubjects,
  validSubjectSelection
} from "@/services/studentSubjects";
import {
  scopeDaily,
  scopePapers,
  scopeExams,
  scopeGeneratedReport,
  assignedSubjectPrompt
} from "../../server/utils/assignedSubjectContext";
import { StudentSubjectSelect } from "@/components/shared/StudentSubjectSelect";
import { DailyRecordCard } from "@/features/progress/DailyRecordCard";
vi.mock("@/i18n/web", () => ({
  useWebCopy: () => (_zh: string, en: string) => en
}));
vi.mock("@/context/I18nContext", () => ({
  useI18n: () => ({ language: "en" })
}));
beforeEach(() => vi.stubGlobal("localStorage", { getItem: () => null }));
const subjects = [
  { id: "eng", name: "English", code: "ENGLISH" },
  { id: "math", name: "Mathematics", code: "MATH" }
];
it("loads only the assigned full-subject endpoint, and never falls back to the global catalogue", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(subjects.map(subject => ({ subject, topics: [] })))
      )
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
    );
  vi.stubGlobal("fetch", fetcher);
  expect(await loadStudentSubjects("child")).toEqual(subjects);
  expect(String(fetcher.mock.calls[0][0])).toContain(
    "/students/child/subjects/full"
  );
  await expect(loadStudentSubjects("other")).rejects.toMatchObject({
    status: 403
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("rejects an unassigned ID even when its name is assigned", () => {
  expect(
    assignedSubject({ subjectId: "other", subjectName: "English" }, subjects)
  ).toBeUndefined();
  expect(
    validSubjectSelection(
      { subjectId: "other", subjectName: "English" },
      subjects
    )
  ).toBe(false);
  expect(validSubjectSelection({ name: " mathematics " }, subjects)).toBe(true);
});
it("keeps an existing unassigned subject on an unrelated edit without allowing a new selection", () => {
  const original = { subjectId: "old", subjectName: "History" };
  expect(validSubjectSelection(original, subjects, [original])).toBe(true);
  expect(validSubjectSelection(original, subjects)).toBe(false);
  expect(
    validSubjectSelection({ ...original, subjectName: "Physics" }, subjects, [
      original
    ])
  ).toBe(false);
});
it("only exposes assigned choices; a historical current value is disabled", () => {
  const html = renderToStaticMarkup(
    createElement(StudentSubjectSelect, {
      value: { subjectId: "old", subjectName: "History" },
      subjects,
      onChange: () => {}
    })
  );
  expect(html).toContain('value="eng"');
  expect(html).toContain('value="math"');
  expect(html).toContain('value="__historical" disabled=""');
  expect(html).not.toContain("Custom subject");
});
it("scopes generated data without losing attendance or mutating stored history", () => {
  const daily = [
    {
      date: "2026-10-01",
      attendance: "present",
      activities: [
        { subjectId: "eng", subjectName: "English" },
        { subjectId: "old", subjectName: "History" }
      ]
    },
    {
      date: "2026-10-02",
      attendance: "absent",
      activities: [{ subjectName: "History" }]
    }
  ];
  const papers = [
    { subjectId: "math", subjectName: "Mathematics", score: 0 },
    { subjectId: "old", subjectName: "History", score: 9 }
  ];
  const exams = [
    {
      id: "exam",
      subjects: [
        { name: "English", score: "0" },
        { name: "History", score: "8" }
      ]
    }
  ];
  expect(
    scopeDaily(daily, subjects).map(row => row.activities.length)
  ).toEqual([1, 0]);
  expect(scopeDaily(daily, subjects)[1].attendance).toBe("absent");
  expect(daily[0].activities).toHaveLength(2);
  expect(scopePapers(papers, subjects)).toEqual([papers[0]]);
  expect(scopeExams(exams, subjects)[0].subjects).toEqual([
    { name: "English", score: "0" }
  ]);
  expect(exams[0].subjects).toHaveLength(2);
});
it("scopes structured AI subjects and includes sparse-data guidance", () => {
  const report = {
    overallComment: "Keep original",
    subjectReports: [
      { subjectRawName: "Mathematics", subjectName: "Math" },
      { subjectName: "History" }
    ]
  };
  expect(scopeGeneratedReport(report, subjects)).toEqual({
    ...report,
    subjectReports: [report.subjectReports[0]]
  });
  expect(report.subjectReports).toHaveLength(2);
  expect(scopeGeneratedReport(report, [])?.subjectReports).toEqual([]);
  expect(assignedSubjectPrompt(subjects)).toContain("不能据此推断缺勤");
});
it("shows useful day and subject previews without exposing edit controls to a read-only viewer", () => {
  const html = renderToStaticMarkup(
    createElement(DailyRecordCard, {
      compact: true,
      record: {
        studentId: "child",
        date: "2026-10-03",
        attendance: "present",
        attendanceStart: "18:00",
        attendanceEnd: "21:00",
        summary: "Three focused hours",
        activities: [
          {
            subject: "Mathematics",
            taskSummary: "Equivalent fractions",
            strengths: "Clear working",
            improvements: "Explain each step"
          }
        ]
      }
    })
  );
  expect(html).toContain("Saturday");
  expect(html).toContain("18:00");
  expect(html).toContain("Equivalent fractions");
  expect(html).toContain("Clear working");
  expect(html).toContain("<details");
  expect(html).not.toContain("Open record");
});
