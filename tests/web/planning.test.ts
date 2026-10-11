import { describe, expect, it } from "vitest";
import {
  planBody,
  recordBody,
  planStatus,
  validExportRange,
  StudentPlan
} from "../../src/features/planning/contracts";
import { validateDateRange } from "../../server/utils/inputValidation";
const data: StudentPlan = {
  cycle: { startDate: "2026-09-27", endDate: "2026-10-01" },
  student: { id: "student", name: "Fixture", grade: "P3" },
  plan: {
    id: "plan",
    grade: "P3",
    weekStarting: "2026-09-27",
    weekEnding: "2026-10-01",
    topic: "Fractions"
  },
  record: null,
  completed: false
};
describe("planning contracts", () => {
  it("uses server cycle boundaries rather than Saturday", () => {
    expect(planBody("P3", " Fractions ", " notes ", data.cycle)).toEqual({
      grade: "P3",
      topic: "Fractions",
      notes: "notes",
      weekStarting: "2026-09-27",
      weekEnding: "2026-10-01"
    });
  });
  it("allows zero as a completed score and keeps unchecked scored records", () => {
    expect(recordBody(data, "0", true, "")).toMatchObject({
      score: 0,
      completed: true
    });
    expect(recordBody(data, "50", false, "")).toMatchObject({
      score: 50,
      completed: false
    });
  });
  it("rejects missing scores for completion, fractions, out of range and grade mismatch", () => {
    for (const score of ["", "1.5", "-1", "101"])
      expect(() => recordBody(data, score, true, "")).toThrow();
    expect(() =>
      recordBody(
        { ...data, student: { ...data.student, grade: "P4" } },
        "50",
        true,
        ""
      )
    ).toThrow();
    expect(recordBody(data, "", false, "").score).toBeNull();
  });
  it("distinguishes missing plan, missing record, score-only and completed", () => {
    expect(planStatus(null, null)).toBe("no-plan");
    expect(planStatus(data.plan, null)).toBe("no-record");
    expect(planStatus(data.plan, { score: 0, completed: false })).toBe(
      "scored"
    );
    expect(planStatus(data.plan, { score: 0, completed: true })).toBe(
      "completed"
    );
  });
  it("matches the server inclusive export date limit", () => {
    for (const [start, end] of [
      ["2026-01-01", "2027-01-05"],
      ["2026-01-01", "2027-01-06"],
      ["2026-10-03", "2026-10-01"],
      ["2026-02-30", "2026-03-01"]
    ])
      expect(validExportRange(start, end)).toBe(
        validateDateRange({
          startDate: start,
          endDate: end,
          maxDays: 370,
          fieldPrefix: "range"
        }).length === 0
      );
  });
});
