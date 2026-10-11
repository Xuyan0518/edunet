import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  weeklyBody,
  weeklyContent,
  sourceRange,
  generateWeeklyDraft,
  WeeklyRecord
} from "../../src/features/weekly/contracts";
const record: WeeklyRecord = {
  id: "weekly-1",
  updatedAt: "2026-10-01T00:00:00.000Z",
  studentId: "child-1",
  weekStarting: "2026-09-27",
  weekEnding: "2026-10-03",
  summary: "Old",
  strengths: ["历史优点"],
  areasToImprove: ["历史改进"],
  teacherNotes: "旧教师备注",
  nextWeekFocus: "旧下周重点",
  reviewStatus: "published",
  visibleToParent: true
};
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null });
});
describe("weekly contracts", () => {
  it("includes Sunday and Saturday but excludes the next Sunday", () => {
    expect(
      sourceRange(
        ["2026-09-26", "2026-09-27", "2026-10-03", "2026-10-04"].map(date => ({
          date
        })),
        "2026-09-27"
      ).map(row => row.date)
    ).toEqual(["2026-09-27", "2026-10-03"]);
  });
  it("preserves legacy fields and original version without sending publication fields", () => {
    const body = weeklyBody(record, "New");
    expect(body).toMatchObject({
      summary: "New",
      updatedAt: record.updatedAt,
      strengths: record.strengths,
      areasToImprove: record.areasToImprove,
      teacherNotes: record.teacherNotes,
      nextWeekFocus: record.nextWeekFocus
    });
    expect(body).not.toHaveProperty("visibleToParent");
    expect(body).not.toHaveProperty("reviewStatus");
    expect(record.summary).toBe("Old");
  });
  it("requires original version and enforces text boundary", () => {
    expect(() =>
      weeklyBody({ ...record, updatedAt: undefined }, "New")
    ).toThrow();
    expect(() => weeklyBody(record, "文".repeat(5001))).toThrow();
    expect(weeklyBody(record, "文".repeat(5000)).summary.length).toBe(5000);
  });
  it("compares intended content independently of server publication metadata", () => {
    expect(weeklyContent(record)).toBe(
      weeklyContent({
        ...record,
        updatedAt: "new",
        visibleToParent: false,
        reviewStatus: "pending"
      })
    );
  });
  it("AI generation makes only the summary request and does not persist feedback", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ summary: "AI draft", strengths: ["ignored"] })
        )
      );
    vi.stubGlobal("fetch", fetch);
    expect(await generateWeeklyDraft("child-1", "2026-09-27")).toBe("AI draft");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain("/ai/weekly-summary");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      studentId: "child-1",
      weekStarting: "2026-09-27",
      weekEnding: "2026-10-03"
    });
  });
  it("AI failure retains responsibility with the caller and performs no fallback write", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "AI_NOT_CONFIGURED" }), {
          status: 503
        })
      );
    vi.stubGlobal("fetch", fetch);
    await expect(generateWeeklyDraft("child-1", "2026-09-27")).rejects.toThrow(
      "AI_NOT_CONFIGURED"
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
